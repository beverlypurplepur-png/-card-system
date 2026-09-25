import { getDocTitleByEditorHost } from '@blocksuite/affine-fragment-doc-title';
import type { RootBlockModel } from '@blocksuite/affine-model';
import {
  FeatureFlagService,
  isVirtualKeyboardProviderWithAction,
  VirtualKeyboardProvider,
  type VirtualKeyboardProviderWithAction,
} from '@blocksuite/affine-shared/services';
import { IS_MOBILE } from '@blocksuite/global/env';
import { WidgetComponent, WidgetViewExtension } from '@blocksuite/std';
import { effect, signal } from '@preact/signals-core';
import { html, nothing } from 'lit';
import { literal, unsafeStatic } from 'lit/static-html.js';

import {
  defaultKeyboardToolbarConfig,
  KeyboardToolbarConfigExtension,
} from './config.js';

export const AFFINE_KEYBOARD_TOOLBAR_WIDGET = 'affine-keyboard-toolbar-widget';

export class AffineKeyboardToolbarWidget extends WidgetComponent<RootBlockModel> {
  private readonly _show$ = signal(false);

  private _initialInputMode: string = '';

  private get _isEdgeless() {
    return this.block?.tagName === 'AFFINE-EDGELESS-ROOT';
  }

  // Web Canvas does not install the mobile app's keyboard provider.
  private readonly _webKeyboard = {
    visible$: signal(false),
    height$: signal(0),
    staticHeight$: signal(0),
    appTabSafeArea$: signal('0px'),
  };

  get keyboard(): VirtualKeyboardProviderWithAction & { fallback?: boolean } {
    const provider = this._isEdgeless
      ? (this.std.getOptional(VirtualKeyboardProvider) ?? this._webKeyboard)
      : this.std.get(VirtualKeyboardProvider);
    if (isVirtualKeyboardProviderWithAction(provider)) return provider;

    return {
      // fallback keyboard actions
      fallback: true,
      show: () => {
        const rootComponent = this.block?.rootComponent;
        if (rootComponent && rootComponent === document.activeElement) {
          rootComponent.inputMode = this._initialInputMode;
        }
      },
      hide: () => {
        const rootComponent = this.block?.rootComponent;
        if (rootComponent && rootComponent === document.activeElement) {
          rootComponent.inputMode = 'none';
        }
      },
      ...provider,
    };
  }

  private get _docTitle() {
    return getDocTitleByEditorHost(this.std.host);
  }

  get config() {
    return {
      ...defaultKeyboardToolbarConfig,
      ...this.std.getOptional(KeyboardToolbarConfigExtension.identifier),
    };
  }

  override connectedCallback(): void {
    super.connectedCallback();

    if (this._isEdgeless && !this.std.getOptional(VirtualKeyboardProvider)) {
      const viewport = window.visualViewport;
      if (viewport) {
        const update = () => {
          const height = Math.max(
            0,
            window.innerHeight - viewport.height - viewport.offsetTop
          );
          this._webKeyboard.visible$.value = height > 0;
          this._webKeyboard.height$.value = height;
          if (height > 0) this._webKeyboard.staticHeight$.value = height;
        };
        this.disposables.addFromEvent(viewport, 'resize', update);
        this.disposables.addFromEvent(viewport, 'scroll', update);
        update();
      }
    }

    this.disposables.add(
      effect(() => {
        this._show$.value = this.std.event.active$.value;
      })
    );

    const rootComponent = this.block?.rootComponent;
    if (rootComponent && this.keyboard.fallback) {
      this._initialInputMode = rootComponent.inputMode;
      this.disposables.add(() => {
        rootComponent.inputMode = this._initialInputMode;
      });
      this.disposables.add(
        effect(() => {
          // recover input mode when keyboard toolbar is hidden
          if (!this._show$.value) {
            rootComponent.inputMode = this._initialInputMode;
          }
        })
      );
    }

    if (this._docTitle) {
      const { inlineEditorContainer } = this._docTitle;
      this.disposables.addFromEvent(inlineEditorContainer, 'focus', () => {
        this._show$.value = true;
      });
      this.disposables.addFromEvent(inlineEditorContainer, 'blur', () => {
        this._show$.value = false;
      });
    }
  }

  override render() {
    if (
      this.store.readonly ||
      (!this._isEdgeless &&
        (!IS_MOBILE ||
          !this.store
            .get(FeatureFlagService)
            .getFlag('enable_mobile_keyboard_toolbar')))
    )
      return nothing;

    if (!this._isEdgeless && !this._show$.value) return nothing;

    if (!this.block?.rootComponent) return nothing;

    return html`<blocksuite-portal
      .shadowDom=${false}
      .template=${html`<affine-keyboard-toolbar
        placement=${this._isEdgeless ? 'right' : 'bottom'}
        .keyboard=${this.keyboard}
        .config=${this.config}
        .rootComponent=${this.block.rootComponent}
      ></affine-keyboard-toolbar>`}
    ></blocksuite-portal>`;
  }
}

export const keyboardToolbarWidget = WidgetViewExtension(
  'affine:page',
  AFFINE_KEYBOARD_TOOLBAR_WIDGET,
  literal`${unsafeStatic(AFFINE_KEYBOARD_TOOLBAR_WIDGET)}`
);

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_KEYBOARD_TOOLBAR_WIDGET]: AffineKeyboardToolbarWidget;
  }
}
