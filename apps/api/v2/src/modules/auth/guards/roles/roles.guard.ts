import { ORG_ROLES, TEAM_ROLES, SYSTEM_ADMIN_ROLE } from "@/lib/roles/constants";
import { GetUserReturnType } from "@/modules/auth/decorators/get-user/get-user.decorator";
import { Roles } from "@/modules/auth/decorators/roles/roles.decorator";
import { MembershipsRepository } from "@/modules/memberships/memberships.repository";
import { OrganizationsRepository } from "@/modules/organizations/organizations.repository";
import { RedisService } from "@/modules/redis/redis.service";
import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";

import { Team } from "@calcom/prisma/client";

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger("RolesGuard Logger");
  constructor(
    private reflector: Reflector,
    private membershipRepository: MembershipsRepository,
    private organizationsRepository: OrganizationsRepository,
    private readonly redisService: RedisService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { team: Team }>();
    const teamId = request.params.teamId as string;
    const orgId = request.params.orgId as string;
    const user = request.user as GetUserReturnType;
    const allowedRole = this.reflector.get(Roles, context.getHandler());
    const REDIS_CACHE_KEY = `apiv2:user:${user.id ?? "none"}:org:${orgId ?? "none"}:team:${
      teamId ?? "none"
    }:guard:roles:${allowedRole}`;
    const cachedAccess = JSON.parse((await this.redisService.redis.get(REDIS_CACHE_KEY)) ?? "false");

    if (cachedAccess) {
      return cachedAccess;
    }

    let canAccess = false;

    // User is not authenticated
    if (!user) {
      this.logger.log("User is not authenticated, denying access.");
      canAccess = false;
    }

    // System admin can access everything
    else if (user.isSystemAdmin) {
      this.logger.log(`User (${user.id}) is system admin, allowing access.`);
      canAccess = true;
    }

    // if the required role is SYSTEM_ADMIN_ROLE but user is not system admin, return false
    else if (allowedRole === SYSTEM_ADMIN_ROLE && !user.isSystemAdmin) {
      this.logger.log(`User (${user.id}) is not system admin, denying access.`);
      canAccess = false;
    }

    // Checking the role of the user within the organization
    else if (Boolean(orgId) && !Boolean(teamId)) {
      const membership = await this.membershipRepository.findMembershipByOrgId(Number(orgId), user.id);
      if (!membership) {
        this.logger.log(`User (${user.id}) is not a member of the organization (${orgId}), denying access.`);
        throw new ForbiddenException(`User is not a member of the organization.`);
      }

      const adminAPIAccessIsEnabledInOrg = await this.organizationsRepository.fetchOrgAdminApiStatus(
        Number(orgId)
      );
      if (!adminAPIAccessIsEnabledInOrg) {
        this.logger.log(`Org (${orgId}) Admin API access is not enabled, denying access`);
        throw new ForbiddenException(`Organization does not have Admin API access`);
      }

      if (ORG_ROLES.includes(allowedRole as unknown as (typeof ORG_ROLES)[number])) {
        canAccess = hasMinimumRole({
          checkRole: `ORG_${membership.role}`,
          minimumRole: allowedRole,
          roles: ORG_ROLES,
        });
      }
    }

    // Checking the role of the user within the team
    else if (Boolean(teamId) && !Boolean(orgId)) {
      const membership = await this.membershipRepository.findMembershipByTeamId(Number(teamId), user.id);
      if (!membership) {
        this.logger.log(`User (${user.id}) is not a member of the team (${teamId}), denying access.`);
        throw new ForbiddenException(`User is not a member of the team.`);
      }
      if (TEAM_ROLES.includes(allowedRole as unknown as (typeof TEAM_ROLES)[number])) {
        canAccess = hasMinimumRole({
          checkRole: `TEAM_${membership.role}`,
          minimumRole: allowedRole,
          roles: TEAM_ROLES,
        });
      }
    }

    // Checking the role for team and org, org is above team in term of permissions
    else if (Boolean(teamId) && Boolean(orgId)) {
      const teamMembership = await this.membershipRepository.findMembershipByTeamId(Number(teamId), user.id);
      const orgMembership = await this.membershipRepository.findMembershipByOrgId(Number(orgId), user.id);

      if (!orgMembership) {
        this.logger.log(`User (${user.id}) is not part of the organization (${orgId}), denying access.`);
        throw new ForbiddenException(`User is not part of the organization.`);
      }

      // if the role checked is a TEAM role
      if (TEAM_ROLES.includes(allowedRole as unknown as (typeof TEAM_ROLES)[number])) {
        // if the user is admin or owner of org, allow request because org > team
        if (`ORG_${orgMembership.role}` === "ORG_ADMIN" || `ORG_${orgMembership.role}` === "ORG_OWNER") {
          canAccess = true;
        } else {
          if (!teamMembership) {
            this.logger.log(
              `User (${user.id}) is not part of the team (${teamId}) and/or, is not an admin nor an owner of the organization (${orgId}).`
            );
            throw new ForbiddenException(
              "User is not part of the team and/or, is not an admin nor an owner of the organization."
            );
          }

          // if user is not admin nor an owner of org, and is part of the team, then check user team membership role
          canAccess = hasMinimumRole({
            checkRole: `TEAM_${teamMembership.role}`,
            minimumRole: allowedRole,
            roles: TEAM_ROLES,
          });
        }
      }

      // if allowed role is a ORG ROLE, check org membersip role
      else if (ORG_ROLES.includes(allowedRole as unknown as (typeof ORG_ROLES)[number])) {
        canAccess = hasMinimumRole({
          checkRole: `ORG_${orgMembership.role}`,
          minimumRole: allowedRole,
          roles: ORG_ROLES,
        });
      }
    }
    await this.redisService.redis.set(REDIS_CACHE_KEY, String(canAccess), "EX", 300);
    return canAccess;
  }
}

type Roles = (typeof ORG_ROLES)[number] | (typeof TEAM_ROLES)[number];

type HasMinimumTeamRoleProp = {
  checkRole: (typeof TEAM_ROLES)[number];
  minimumRole: string;
  roles: typeof TEAM_ROLES;
};

type HasMinimumOrgRoleProp = {
  checkRole: (typeof ORG_ROLES)[number];
  minimumRole: string;
  roles: typeof ORG_ROLES;
};

type HasMinimumRoleProp = HasMinimumTeamRoleProp | HasMinimumOrgRoleProp;

export function hasMinimumRole(props: HasMinimumRoleProp): boolean {
  const checkedRoleIndex = props.roles.indexOf(props.checkRole as never);
  const requiredRoleIndex = props.roles.indexOf(props.minimumRole as never);

  // minimum role given does not exist
  if (checkedRoleIndex === -1 || requiredRoleIndex === -1) {
    throw new Error("Invalid role");
  }

  return checkedRoleIndex <= requiredRoleIndex;
}
