import { describe, expect, test } from 'vitest';

import { selectStartupWorkspace } from './workspace-selection';

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
