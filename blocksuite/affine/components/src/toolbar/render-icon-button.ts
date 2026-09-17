import { html, type TemplateResult } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { styleMap } from 'lit/directives/style-map.js';

export function renderToolbarIconButton({
  icon,
  disabled,
  onClick,
  style = styleMap({}),
  label,
}: {
  icon: TemplateResult;
  disabled: boolean;
  onClick: () => void;
  style?: ReturnType<typeof styleMap>;
  label?: string;
}) {
  return html`<icon-button
    size="36px"
    style=${style}
    aria-label=${ifDefined(label)}
    title=${ifDefined(label)}
    ?disabled=${disabled}
    @click=${onClick}
  >
    ${icon}
  </icon-button>`;
}
