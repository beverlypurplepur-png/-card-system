import type { WorkspaceMetadata } from '@affine/core/modules/workspace';

export function shouldBootstrapLocalWorkspace({
  enableLocalWorkspace,
  isMobileWeb,
  isWeb,
  listIsLoading,
  workspaceCount,
}: {
  enableLocalWorkspace: boolean;
  isMobileWeb: boolean;
  isWeb: boolean;
  listIsLoading: boolean;
  workspaceCount: number;
}) {
  return (
    !isWeb &&
    !isMobileWeb &&
    !listIsLoading &&
    workspaceCount === 0 &&
    enableLocalWorkspace
  );
}

export function selectStartupWorkspace(
  workspaces: WorkspaceMetadata[],
  lastWorkspaceId: string | null,
  authenticated: boolean
) {
  const lastCloudWorkspace = workspaces.find(
    workspace =>
      workspace.id === lastWorkspaceId && workspace.flavour === 'affine-cloud'
  );

  if (authenticated) {
    if (lastCloudWorkspace) {
      return lastCloudWorkspace;
    }

    const cloudWorkspace = workspaces.find(
      workspace => workspace.flavour === 'affine-cloud'
    );
    if (cloudWorkspace) {
      return cloudWorkspace;
    }
  }

  return (
    workspaces.find(workspace => workspace.id === lastWorkspaceId) ??
    workspaces[0]
  );
}
