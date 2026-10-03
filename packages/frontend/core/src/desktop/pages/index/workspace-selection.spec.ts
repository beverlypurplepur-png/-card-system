import { describe, expect, test } from 'vitest';

import {
  selectStartupWorkspace,
  shouldBootstrapLocalWorkspace,
} from './workspace-selection';

const local = { id: 'local', flavour: 'local' };
const cloudA = { id: 'cloud-a', flavour: 'affine-cloud' };
const cloudB = { id: 'cloud-b', flavour: 'affine-cloud' };

describe('selectStartupWorkspace', () => {
  test('keeps an accessible cloud workspace selected', () => {
    expect(selectStartupWorkspace([local, cloudA], cloudA.id, true)).toEqual(
      cloudA
    );
  });

  test('does not let a local workspace override an authenticated cloud workspace', () => {
    expect(selectStartupWorkspace([local, cloudA], local.id, true)).toEqual(
      cloudA
    );
  });

  test('keeps the local workspace when the account has no cloud workspace', () => {
    expect(selectStartupWorkspace([local], local.id, true)).toEqual(local);
  });

  test('uses the existing workspace order as the cloud fallback', () => {
    expect(
      selectStartupWorkspace([local, cloudB, cloudA], local.id, true)
    ).toEqual(cloudB);
  });

  test('preserves local workspace selection for signed-out users', () => {
    expect(selectStartupWorkspace([cloudA, local], local.id, false)).toEqual(
      local
    );
  });
});

describe('shouldBootstrapLocalWorkspace', () => {
  const nativeEmptyState = {
    enableLocalWorkspace: true,
    isMobileWeb: false,
    isWeb: false,
    listIsLoading: false,
    workspaceCount: 0,
  };

  test('does not bootstrap a local workspace for a new web origin', () => {
    expect(
      shouldBootstrapLocalWorkspace({
        ...nativeEmptyState,
        isWeb: true,
      })
    ).toBe(false);
  });

  test('does not bootstrap a local workspace for mobile web', () => {
    expect(
      shouldBootstrapLocalWorkspace({
        ...nativeEmptyState,
        isMobileWeb: true,
      })
    ).toBe(false);
  });

  test('waits while workspace discovery is loading', () => {
    expect(
      shouldBootstrapLocalWorkspace({
        ...nativeEmptyState,
        listIsLoading: true,
      })
    ).toBe(false);
  });

  test('preserves the existing native local bootstrap', () => {
    expect(shouldBootstrapLocalWorkspace(nativeEmptyState)).toBe(true);
  });
});
