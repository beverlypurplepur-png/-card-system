/**
 * @vitest-environment happy-dom
 */

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authenticated: false,
  listIsLoading: false,
  workspaces: [] as { id: string; flavour: string }[],
}));
const openPage = vi.hoisted(() => vi.fn());
const jumpToPage = vi.hoisted(() => vi.fn());
const jumpToSignIn = vi.hoisted(() => vi.fn());
const createFirstAppData = vi.hoisted(() => vi.fn());
const AuthServiceToken = vi.hoisted(() => class AuthService {});
const DefaultServerServiceToken = vi.hoisted(
  () => class DefaultServerService {}
);
const WorkspacesServiceToken = vi.hoisted(() => class WorkspacesService {});

const authStatus = { source: 'auth-status' };
const localWorkspaceEnabled = { source: 'local-workspace-enabled' };
const workspaceList = { source: 'workspace-list' };
const workspaceListLoading = { source: 'workspace-list-loading' };

vi.mock('@affine/core/modules/cloud', () => ({
  DefaultServerService: DefaultServerServiceToken,
}));

vi.mock('../../../modules/cloud', () => ({
  AuthService: AuthServiceToken,
  DefaultServerService: DefaultServerServiceToken,
}));

vi.mock('@affine/core/modules/workspace', () => ({
  WorkspacesService: WorkspacesServiceToken,
}));

vi.mock('@affine/core/modules/desktop-api', () => ({
  DesktopApiService: class DesktopApiService {},
}));

vi.mock('@affine/core/utils/first-app-data', () => ({
  buildShowcaseWorkspace: vi.fn(),
  createFirstAppData,
}));

vi.mock('@affine/graphql', () => ({
  ServerFeature: { LocalWorkspace: 'LocalWorkspace' },
}));

vi.mock('@toeverything/infra', () => ({
  useLiveData: (source: { source: string }) => {
    switch (source.source) {
      case 'auth-status':
        return state.authenticated;
      case 'local-workspace-enabled':
        return true;
      case 'workspace-list':
        return state.workspaces;
      case 'workspace-list-loading':
        return state.listIsLoading;
      default:
        return undefined;
    }
  },
  useService: (token: unknown) => {
    if (token === AuthServiceToken) {
      return {
        session: {
          status$: { map: () => authStatus },
        },
      };
    }
    if (token === DefaultServerServiceToken) {
      return {
        server: {
          config$: { selector: () => localWorkspaceEnabled },
        },
      };
    }
    if (token === WorkspacesServiceToken) {
      return {
        list: {
          isRevalidating$: workspaceListLoading,
          workspaces$: workspaceList,
        },
      };
    }
    throw new Error('Unexpected service');
  },
  useServiceOptional: () => null,
}));

vi.mock('../../../components/hooks/use-navigate-helper', () => ({
  RouteLogic: { REPLACE: 'replace' },
  useNavigateHelper: () => ({ openPage, jumpToPage, jumpToSignIn }),
}));

vi.mock('../../../components/workspace-selector', () => ({
  WorkspaceNavigator: () => <div data-testid="workspace-navigator" />,
}));

vi.mock('../../components/app-container', () => ({
  AppContainer: () => <div data-testid="app-container" />,
}));

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams()],
}));

import { Component } from './index';

const cloudWorkspace = { id: 'cloud-workspace', flavour: 'affine-cloud' };

describe('workspace index login lifecycle', () => {
  beforeEach(() => {
    state.authenticated = false;
    state.listIsLoading = false;
    state.workspaces = [];
    openPage.mockReset();
    jumpToPage.mockReset();
    jumpToSignIn.mockReset();
    createFirstAppData.mockReset();
    vi.stubGlobal('BUILD_CONFIG', {
      isMobileEdition: false,
      isMobileWeb: false,
      isNative: false,
      isWeb: true,
    });
    localStorage.clear();
  });

  test('navigates when a cloud workspace arrives after login', () => {
    const view = render(<Component />);

    state.authenticated = true;
    state.listIsLoading = true;
    view.rerender(<Component />);
    expect(openPage).not.toHaveBeenCalled();

    state.listIsLoading = false;
    state.workspaces = [cloudWorkspace];
    view.rerender(<Component />);

    expect(openPage).toHaveBeenCalledWith(cloudWorkspace.id, 'all', 'replace');
    expect(createFirstAppData).not.toHaveBeenCalled();
  });

  test('rediscovers the same cloud workspace after logout and login', () => {
    const view = render(<Component />);

    state.authenticated = true;
    state.workspaces = [cloudWorkspace];
    view.rerender(<Component />);
    expect(openPage).toHaveBeenCalledTimes(1);

    state.authenticated = false;
    state.workspaces = [];
    view.rerender(<Component />);
    openPage.mockClear();

    state.authenticated = true;
    state.listIsLoading = true;
    view.rerender(<Component />);
    state.listIsLoading = false;
    state.workspaces = [cloudWorkspace];
    view.rerender(<Component />);

    expect(openPage).toHaveBeenCalledWith(cloudWorkspace.id, 'all', 'replace');
    expect(createFirstAppData).not.toHaveBeenCalled();
  });
});
