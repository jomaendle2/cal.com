import {
  addUsers,
  getDate,
  createBookingScenario,
  getScenarioData,
  getMockBookingAttendee,
  TestData,
} from "@calcom/web/test/utils/bookingScenario/bookingScenario";
import {
  expectBookingToBeInDatabase,
  expectSuccessfulRoundRobinReschedulingEmails,
  expectWorkflowToBeTriggered,
} from "@calcom/web/test/utils/bookingScenario/expects";
import { setupAndTeardown } from "@calcom/web/test/utils/bookingScenario/setupAndTeardown";

import { describe, vi, expect } from "vitest";

import { SchedulingType, BookingStatus } from "@calcom/prisma/enums";
import { test } from "@calcom/web/test/fixtures/fixtures";

vi.mock("@calcom/core/EventManager");

describe("roundRobinReassignment test", () => {
  setupAndTeardown();

  test("reassign new team member", async ({ emails }) => {
    const roundRobinReassignment = (await import("./roundRobinReassignment")).default;
    const EventManager = (await import("@calcom/core/EventManager")).default;

    const eventManagerSpy = vi.spyOn(EventManager.prototype as any, "reschedule");

    const users = await addUsers([
      {
        id: 1,
        name: "user-1",
        timeZone: "Asia/Kolkata",
        username: "host-1",
        email: "host1@test.com",
        schedules: [TestData.schedules.IstWorkHours],
      },
      {
        id: 2,
        name: "user-2",
        timeZone: "Asia/Kolkata",
        username: "host-2",
        email: "host2@test.com",
        schedules: [TestData.schedules.IstWorkHours],
      },
      {
        id: 3,
        name: "user-3",
        timeZone: "Asia/Kolkata",
        username: "host-3",
        email: "host3@test.com",
        schedules: [TestData.schedules.IstWorkHours],
      },
    ]);

    const originalHost = users[0];
    const newHost = users[1];
    // Assume we are using the RR fairness algorithm. Add an extra booking for user[2] to ensure user[1] is the new host

    const { dateString: dateStringPlusOne } = getDate({ dateIncrement: 1 });
    const { dateString: dateStringMinusOne } = getDate({ dateIncrement: -1 });

    const bookingToReassignUid = "booking-to-reassign";

    await createBookingScenario(
      getScenarioData({
        workflows: [
          {
            userId: originalHost.id,
            trigger: "NEW_EVENT",
            action: "EMAIL_HOST",
            template: "REMINDER",
            activeEventTypeId: 1,
          },
        ],
        eventTypes: [
          {
            id: 1,
            slug: "round-robin-event",
            schedulingType: SchedulingType.ROUND_ROBIN,
            length: 45,
            users: users.map((user) => {
              return {
                id: user.id,
              };
            }),
            hosts: users.map((user) => {
              return {
                userId: user.id,
                isFixed: false,
              };
            }),
          },
        ],
        bookings: [
          {
            id: 123,
            eventTypeId: 1,
            userId: originalHost.id,
            uid: bookingToReassignUid,
            status: BookingStatus.ACCEPTED,
            startTime: `${dateStringPlusOne}T05:00:00.000Z`,
            endTime: `${dateStringPlusOne}T05:15:00.000Z`,
            attendees: [
              getMockBookingAttendee({
                id: 2,
                name: "attendee",
                email: "attendee@test.com",
                locale: "en",
                timeZone: "Asia/Kolkata",
              }),
            ],
          },
          {
            id: 456,
            eventTypeId: 1,
            userId: 3,
            uid: bookingToReassignUid,
            status: BookingStatus.ACCEPTED,
            startTime: `${dateStringMinusOne}T05:00:00.000Z`,
            endTime: `${dateStringMinusOne}T05:15:00.000Z`,
            attendees: [
              getMockBookingAttendee({
                id: 2,
                name: "attendee",
                email: "attendee@test.com",
                locale: "en",
                timeZone: "Asia/Kolkata",
              }),
            ],
          },
        ],
        organizer: originalHost,
        usersApartFromOrganizer: users.slice(1),
      })
    );

    await roundRobinReassignment({
      eventTypeId: 1,
      bookingId: 123,
    });

    expect(eventManagerSpy).toBeCalledTimes(1);
    // Triggers moving to new host within event manager
    expect(eventManagerSpy).toHaveBeenCalledWith(expect.any(Object), bookingToReassignUid, undefined, true, [
      null,
    ]);

    // Use equal fairness rr algorithm
    expectBookingToBeInDatabase({
      uid: bookingToReassignUid,
      userId: 3,
    });

    expectSuccessfulRoundRobinReschedulingEmails({
      prevOrganizer: originalHost,
      newOrganizer: newHost,
      emails,
    });

    expectWorkflowToBeTriggered({ emailsToReceive: [newHost.email], emails });
  });

  // TODO: add fixed hosts test
  // TODO: ensure calendar event is updated
  // TODO: ensure destination calendar changes
});