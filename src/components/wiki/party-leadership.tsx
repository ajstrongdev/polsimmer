import { instance } from "@/lib/instance-config";
import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Button } from "@/components/ui/button";
import { ManagePartyDialog } from "@/components/wiki/manage-party-dialog";
import { WikiSection } from "@/components/wiki/wiki-layout";
import { appointPartyOfficer } from "@/lib/server/organizations/party";

type Member = { id: number; username: string; photoUrl: string | null };
type Party = {
  id: number;
  name: string;
  leaderId: number | null;
  chiefWhipId: number | null;
  socialMediaOfficerId: number | null;
  color: string;
  bio: string | null;
  logo: string | null;
  leaning: string | null;
  discord?: string | null;
};

export function PartyLeadership({
  party,
  members,
  currentUserId,
}: {
  party: Party;
  members: Array<Member>;
  currentUserId: number | null;
}) {
  const isLeader = currentUserId === party.leaderId;
  const leader = members.find((member) => member.id === party.leaderId);

  return (
    <WikiSection
      title="Party leadership"
      description="Officers coordinate the party's public presence and legislative strategy."
      aside={isLeader ? <ManagePartyDialog party={party} /> : undefined}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-4 rounded-md border bg-card p-4">
          <div>
            <h3 className="font-serif text-lg font-semibold">Party Leader</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Approves membership requests, expels members, and appoints
               officers. Does not issue guidance, enforce whips, or manage {instance.branding.socialName}.
            </p>
          </div>
          <OfficerIdentity member={leader} />
        </div>
        <OfficerCard
          partyId={party.id}
          office="chiefWhip"
          title="Chief Whip"
          description="Issues voting guidance and may enforce a binding whip on one bill every 24 hours."
          holderId={party.chiefWhipId}
          otherHolderId={party.socialMediaOfficerId}
          leaderId={party.leaderId}
          members={members}
          canManage={isLeader}
        />
        <OfficerCard
          partyId={party.id}
          office="socialMediaOfficer"
          title="Social Media Officer"
          description={`Publishes official party updates on ${instance.branding.socialName}.`}
          holderId={party.socialMediaOfficerId}
          otherHolderId={party.chiefWhipId}
          leaderId={party.leaderId}
          members={members}
          canManage={isLeader}
        />
      </div>
    </WikiSection>
  );
}

function OfficerIdentity({ member }: { member?: Member }) {
  return member ? (
    <div className="mt-auto flex min-w-0 items-center gap-2 border-t pt-3">
      <PlayerAvatar
        username={member.username}
        photoUrl={member.photoUrl}
        className="size-9 shrink-0"
      />
      <span className="truncate font-medium">{member.username}</span>
    </div>
  ) : (
    <p className="mt-auto border-t pt-3 text-sm text-muted-foreground">
      Vacant
    </p>
  );
}

function OfficerCard({
  partyId,
  office,
  title,
  description,
  holderId,
  otherHolderId,
  leaderId,
  members,
  canManage,
}: {
  partyId: number;
  office: "chiefWhip" | "socialMediaOfficer";
  title: string;
  description: string;
  holderId: number | null;
  otherHolderId: number | null;
  leaderId: number | null;
  members: Array<Member>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [selection, setSelection] = useState<number | null>(holderId);
  const [saving, setSaving] = useState(false);
  const holder = members.find((member) => member.id === holderId);
  const eligible = members.filter(
    (member) => member.id !== leaderId && member.id !== otherHolderId,
  );

  const save = async () => {
    setSaving(true);
    try {
      await appointPartyOfficer({
        data: { partyId, office, userId: selection },
      });
      await router.invalidate();
      setEditing(false);
      toast.success(
        selection === null ? `${title} office vacated` : `${title} appointed`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update officer",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-md border bg-card p-4">
      <div>
        <h3 className="font-serif text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {editing ? (
        <div className="mt-auto space-y-2 border-t pt-3">
          <label
            htmlFor={`assign-${office}`}
            className="block text-sm font-medium"
          >
            Choose a party member
          </label>
          <select
            id={`assign-${office}`}
            value={selection ?? ""}
            disabled={saving}
            onChange={(event) =>
              setSelection(
                event.target.value ? Number(event.target.value) : null,
              )
            }
            className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Vacant</option>
            {eligible.map((member) => (
              <option key={member.id} value={member.id}>
                {member.username}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={saving || selection === holderId}
              onClick={save}
            >
              {saving
                ? "Saving…"
                : selection === null
                  ? "Vacate office"
                  : "Save appointment"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-auto">
          <OfficerIdentity member={holder} />
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3 w-full"
              onClick={() => {
                setSelection(holderId);
                setEditing(true);
              }}
            >
              {holder ? "Change officer" : "Appoint officer"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
