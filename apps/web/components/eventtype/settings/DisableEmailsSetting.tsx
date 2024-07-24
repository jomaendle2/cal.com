import type { TFunction } from "next-i18next";
import { Trans } from "next-i18next";
import { useState } from "react";

import {
  SettingsToggle,
  Dialog,
  DialogContent,
  DialogFooter,
  InputField,
  DialogClose,
  Button,
} from "@calcom/ui";

interface DisableEmailsSettingProps {
  checked: boolean;
  onCheckedChange: (e: boolean) => void;
  recipient: "attendees" | "host";
  t: TFunction;
}

export const DisableEmailsSetting = ({
  checked,
  onCheckedChange,
  recipient,
  t,
}: DisableEmailsSettingProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  return (
    <div>
      <Dialog open={dialogOpen} onOpenChange={(e) => setDialogOpen(e)}>
        <DialogContent title={t("disable_all_emails_to_attendees")} Icon="circle-alert">
          <p className="text-default text-sm">
            <Trans i18nKey="disable_attendees_emails_description">
              <p>
                This will disable all emails to attendees. This includes booking confirmations, requests,
                reschedules and reschedule requests, and cancellation emails.
              </p>
              <p className="mt-2">
                It is your responsibility to ensure that your attendees are aware of any bookings and changes
                to their booking.
              </p>
            </Trans>

            <p className="mb-1 mt-2">{t("type_confirm_to_continue")}</p>
            <InputField
              value={confirmText}
              onChange={(e) => {
                setConfirmText(e.target.value);
              }}
            />
          </p>
          <DialogFooter>
            <DialogClose />
            <Button
              disabled={confirmText !== "confirm"}
              onClick={(e) => {
                onCheckedChange(true);
                setDialogOpen(false);
              }}>
              {t("disable_email")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SettingsToggle
        labelClassName="text-sm"
        toggleSwitchAtTheEnd={true}
        switchContainerClassName="border-subtle rounded-lg border py-6 px-4 sm:px-6"
        title={t("disable_all_emails_to_attendees")}
        description={t("disable_all_emails_to_attendees_description")}
        checked={!!checked}
        onCheckedChange={() => {
          checked ? onCheckedChange(false) : setDialogOpen(true);
        }}
      />
    </div>
  );
};
