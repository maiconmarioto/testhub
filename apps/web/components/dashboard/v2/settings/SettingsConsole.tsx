'use client';

import { DashboardShell } from '../DashboardShell';
import {
  V2ConsoleProvider,
  useV2Console,
} from '../context/V2ConsoleProvider';
import { SettingsWorkspace } from './SettingsWorkspace';

export function SettingsConsole() {
  return (
    <V2ConsoleProvider section='settings'>
      <DashboardShell section='settings' title='Sistema'>
        <SettingsConsoleContent />
      </DashboardShell>
    </V2ConsoleProvider>
  );
}

function SettingsConsoleContent() {
  const consoleState = useV2Console();

  return (
    <SettingsWorkspace
      me={consoleState.me}
      members={consoleState.members}
      organizations={consoleState.organizations}
      managedUsers={consoleState.managedUsers}
      memberDraft={consoleState.memberDraft}
      profileDraft={consoleState.profileDraft}
      orgDraft={consoleState.orgDraft}
      membershipEdit={consoleState.membershipEdit}
      personalTokens={consoleState.personalTokens}
      tokenDraft={consoleState.tokenDraft}
      aiConnections={consoleState.aiConnections}
      aiDraft={consoleState.aiDraft}
      security={consoleState.security}
      audit={consoleState.audit}
      cleanupDays={consoleState.cleanupDays}
      cleanupResult={consoleState.cleanupResult}
      busy={consoleState.busy}
      canWrite={consoleState.canWrite}
      canAdmin={consoleState.canAdmin}
      onMemberDraftChange={consoleState.setMemberDraft}
      onCreateMember={consoleState.createMember}
      onProfileDraftChange={consoleState.setProfileDraft}
      onSaveProfile={consoleState.saveProfile}
      onOrgDraftChange={consoleState.setOrgDraft}
      onCreateOrganization={consoleState.createOrganization}
      onSwitchOrganization={consoleState.switchOrganization}
      onMembershipEditChange={consoleState.setEditedMembership}
      onSaveUserMemberships={consoleState.saveUserMemberships}
      onTokenDraftChange={consoleState.setTokenDraft}
      onCreatePersonalToken={consoleState.createPersonalToken}
      onRevokePersonalToken={consoleState.revokePersonalToken}
      onAiDraftChange={consoleState.setAiDraft}
      onEditAiConnection={consoleState.editAiConnection}
      onSaveAiConnection={consoleState.saveAiConnection}
      onCleanupDaysChange={consoleState.setCleanupDays}
      onCleanup={consoleState.cleanupRuns}
    />
  );
}
