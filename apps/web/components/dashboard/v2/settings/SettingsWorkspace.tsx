'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AiConnection, AuditEntry, AuthMe, MembershipEdit, Organization, OrganizationMember, PersonalAccessToken, Role, SecurityStatus, UserManagementItem } from '../types';
import { SettingsAi } from './SettingsAi';
import { SettingsAudit } from './SettingsAudit';
import { SettingsOrganizations } from './SettingsOrganizations';
import { SettingsProfile } from './SettingsProfile';
import { SettingsUsers } from './SettingsUsers';
import { PersonalTokenControl, ProductionReadiness, SecurityLine } from './SettingsSecurity';

export function SettingsWorkspace(props: {
  me: AuthMe | null;
  members: OrganizationMember[];
  organizations: Organization[];
  managedUsers: UserManagementItem[];
  memberDraft: { email: string; name: string; role: OrganizationMember['membership']['role']; temporaryPassword: string };
  profileDraft: { name: string; email: string; currentPassword: string; newPassword: string };
  orgDraft: { name: string };
  membershipEdit: MembershipEdit;
  personalTokens: PersonalAccessToken[];
  tokenDraft: { name: string; scope: 'all' | 'selected'; organizationIds: string[] };
  aiConnections: AiConnection[];
  aiDraft: { id: string; name: string; provider: AiConnection['provider']; apiKey: string; model: string; baseUrl: string; enabled: boolean };
  security: SecurityStatus | null;
  audit: AuditEntry[];
  cleanupDays: string;
  cleanupResult: string;
  busy: boolean;
  canWrite: boolean;
  canAdmin: boolean;
  onMemberDraftChange: (draft: { email: string; name: string; role: OrganizationMember['membership']['role']; temporaryPassword: string }) => void;
  onCreateMember: () => void;
  onProfileDraftChange: (draft: { name: string; email: string; currentPassword: string; newPassword: string }) => void;
  onSaveProfile: () => void;
  onOrgDraftChange: (draft: { name: string }) => void;
  onCreateOrganization: () => void;
  onSwitchOrganization: (organizationId: string) => void;
  onMembershipEditChange: (userId: string, organizationId: string, roleValue: Role | '') => void;
  onSaveUserMemberships: (userId: string) => void;
  onTokenDraftChange: (draft: { name: string; scope: 'all' | 'selected'; organizationIds: string[] }) => void;
  onCreatePersonalToken: () => void;
  onRevokePersonalToken: (tokenId: string) => void;
  onAiDraftChange: (draft: { id: string; name: string; provider: AiConnection['provider']; apiKey: string; model: string; baseUrl: string; enabled: boolean }) => void;
  onEditAiConnection: (connection: AiConnection) => void;
  onSaveAiConnection: () => void;
  onCleanupDaysChange: (value: string) => void;
  onCleanup: () => void;
}) {
  return (
    <Tabs defaultValue="profile" className="grid gap-4">
      <TabsList className="grid h-auto grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <TabsTrigger value="profile">Perfil</TabsTrigger>
        <TabsTrigger value="organizations">Organizações</TabsTrigger>
        <TabsTrigger value="users">Usuários</TabsTrigger>
        <TabsTrigger value="security">Segurança /MCP</TabsTrigger>
        <TabsTrigger value="ai">AI</TabsTrigger>
        <TabsTrigger value="audit">Audit</TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="m-0">
        <SettingsProfile
          me={props.me}
          profileDraft={props.profileDraft}
          busy={props.busy}
          onProfileDraftChange={props.onProfileDraftChange}
          onSaveProfile={props.onSaveProfile}
        />
      </TabsContent>

      <TabsContent value="organizations" className="m-0">
        <SettingsOrganizations
          me={props.me}
          members={props.members}
          organizations={props.organizations}
          orgDraft={props.orgDraft}
          busy={props.busy}
          canAdmin={props.canAdmin}
          onOrgDraftChange={props.onOrgDraftChange}
          onCreateOrganization={props.onCreateOrganization}
          onSwitchOrganization={props.onSwitchOrganization}
        />
      </TabsContent>

      <TabsContent value="users" className="m-0">
        <SettingsUsers
          organizations={props.organizations}
          managedUsers={props.managedUsers}
          memberDraft={props.memberDraft}
          membershipEdit={props.membershipEdit}
          busy={props.busy}
          canAdmin={props.canAdmin}
          onMemberDraftChange={props.onMemberDraftChange}
          onCreateMember={props.onCreateMember}
          onMembershipEditChange={props.onMembershipEditChange}
          onSaveUserMemberships={props.onSaveUserMemberships}
        />
      </TabsContent>

      <TabsContent value="security" className="m-0">
        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle>Segurança empresa</CardTitle><CardDescription>OIDC, RBAC, allowlist, secrets e retention.</CardDescription></CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              <SecurityLine label="OIDC/Auth.js" ok={Boolean(props.security?.oidc.configured)} value={props.security?.oidc.issuer ?? 'não configurado'} />
              <SecurityLine label="API token" ok={Boolean(props.security?.auth.apiTokenEnabled)} value={props.security?.auth.apiTokenEnabled ? 'ativo' : 'desligado'} />
              <SecurityLine label="RBAC" ok value={props.security?.auth.rbacRole ?? 'viewer'} />
              <SecurityLine label="TESTHUB_SECRET_KEY" ok={!props.security?.secrets.defaultKey} value={props.security?.secrets.defaultKey ? 'default, trocar antes de produção' : 'custom'} />
              <SecurityLine label="Allowlist hosts" ok={Boolean(props.security && !props.security.network.allowAllWhenEmpty)} value={props.security?.network.allowedHosts.join(', ') || 'vazia, permite tudo'} />
              <SecurityLine label="Retention" ok value={`${props.security?.retention.days ?? props.cleanupDays} dias`} />
            </CardContent>
          </Card>
          <ProductionReadiness security={props.security} />
          <Card>
            <CardHeader className="pb-3"><CardTitle>Tokens CLI/MCP</CardTitle><CardDescription>Bearer tokens pessoais para CLI, MCP e automações.</CardDescription></CardHeader>
            <CardContent>
              <PersonalTokenControl
                tokens={props.personalTokens}
                organizations={props.me?.organizations ?? props.organizations}
                draft={props.tokenDraft}
                busy={props.busy}
                onDraftChange={props.onTokenDraftChange}
                onCreate={props.onCreatePersonalToken}
                onRevoke={props.onRevokePersonalToken}
              />
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="ai" className="m-0">
        <SettingsAi
          aiConnections={props.aiConnections}
          aiDraft={props.aiDraft}
          busy={props.busy}
          canAdmin={props.canAdmin}
          onAiDraftChange={props.onAiDraftChange}
          onEditAiConnection={props.onEditAiConnection}
          onSaveAiConnection={props.onSaveAiConnection}
        />
      </TabsContent>

      <TabsContent value="audit" className="m-0">
        <SettingsAudit
          audit={props.audit}
          cleanupDays={props.cleanupDays}
          cleanupResult={props.cleanupResult}
          busy={props.busy}
          canAdmin={props.canAdmin}
          onCleanupDaysChange={props.onCleanupDaysChange}
          onCleanup={props.onCleanup}
        />
      </TabsContent>
    </Tabs>
  );
}
