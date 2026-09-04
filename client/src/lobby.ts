import {
  HAT_OPTIONS,
  LIVES_OPTIONS,
  MAX_STAKE_LENGTH,
  PLAYER_COLORS,
  ROUND_OPTIONS,
  type ArenaState,
} from "@stickstakes/shared";

/**
 * The lobby panel: the room code to read across the table, the host's match
 * setup (rounds, lives, and what everyone is actually playing for), and
 * everyone's own look (colour and hat).
 *
 * Non-hosts see the match setup read-only, so nobody has to ask "how many
 * rounds is this?" — the answer is on their screen too. Look is the opposite:
 * everyone edits their own regardless of host, nobody else's. Both are wired
 * up only while this panel is visible, i.e. only in the lobby — the server
 * enforces that independently, since it never trusts the client.
 */

export interface LobbyPanel {
  update(state: ArenaState, selfId: string, code: string): void;
  hide(): void;
  onConfigure(handler: (change: Configure) => void): void;
  onCustomize(handler: (change: Customize) => void): void;
  onShare(handler: () => void): void;
}

export interface Configure {
  totalRounds?: number;
  livesPerRound?: number;
  stake?: string;
}

export interface Customize {
  color?: string;
  hat?: string;
}

/** One glyph per hat, standing in for real art on a chip button. */
const HAT_GLYPHS: Record<string, string> = {
  none: "—",
  cap: "🧢",
  tophat: "🎩",
  crown: "👑",
  halo: "😇",
  party: "🎉",
};

export function createLobbyPanel(root: ParentNode = document): LobbyPanel {
  const el = root.querySelector<HTMLElement>("#lobby")!;
  const codeEl = root.querySelector<HTMLElement>("#lobby-code-value")!;
  const shareBtn = root.querySelector<HTMLButtonElement>("#lobby-share")!;
  const roundsEl = root.querySelector<HTMLElement>("#setup-rounds")!;
  const livesEl = root.querySelector<HTMLElement>("#setup-lives")!;
  const stakeEl = root.querySelector<HTMLInputElement>("#setup-stake")!;
  const colorEl = root.querySelector<HTMLElement>("#setup-color")!;
  const hatEl = root.querySelector<HTMLElement>("#setup-hat")!;
  const hintEl = root.querySelector<HTMLElement>("#lobby-hint")!;

  let configureHandler: ((change: Configure) => void) | undefined;
  let customizeHandler: ((change: Customize) => void) | undefined;
  let shareHandler: (() => void) | undefined;
  let isHost = false;
  /** True while the host is typing, so incoming state can't yank the cursor. */
  let editingStake = false;

  shareBtn.addEventListener("click", () => shareHandler?.());

  function buildChips(
    container: HTMLElement,
    options: readonly number[],
    key: "totalRounds" | "livesPerRound",
  ): void {
    container.replaceChildren(
      ...options.map((value) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = String(value);
        chip.dataset.value = String(value);
        chip.addEventListener("click", () => {
          if (!isHost) return;
          configureHandler?.({ [key]: value });
        });
        return chip;
      }),
    );
  }

  buildChips(roundsEl, ROUND_OPTIONS, "totalRounds");
  buildChips(livesEl, LIVES_OPTIONS, "livesPerRound");

  colorEl.replaceChildren(
    ...PLAYER_COLORS.map((color) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "swatch";
      swatch.style.background = color;
      swatch.dataset.value = color;
      swatch.addEventListener("click", () => customizeHandler?.({ color }));
      return swatch;
    }),
  );

  hatEl.replaceChildren(
    ...HAT_OPTIONS.map((hat) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = HAT_GLYPHS[hat] ?? hat;
      chip.dataset.value = hat;
      chip.addEventListener("click", () => customizeHandler?.({ hat }));
      return chip;
    }),
  );

  stakeEl.maxLength = MAX_STAKE_LENGTH;
  stakeEl.addEventListener("focus", () => {
    editingStake = true;
  });
  stakeEl.addEventListener("blur", () => {
    editingStake = false;
    if (isHost) configureHandler?.({ stake: stakeEl.value });
  });
  stakeEl.addEventListener("change", () => {
    if (isHost) configureHandler?.({ stake: stakeEl.value });
  });

  function markSelected(container: HTMLElement, value: number): void {
    for (const chip of container.querySelectorAll<HTMLButtonElement>(".chip")) {
      chip.classList.toggle("is-on", chip.dataset.value === String(value));
      chip.disabled = !isHost;
    }
  }

  function markHatSelected(value: string): void {
    for (const chip of hatEl.querySelectorAll<HTMLButtonElement>(".chip")) {
      chip.classList.toggle("is-on", chip.dataset.value === value);
    }
  }

  /**
   * Colour swatches: mark the player's own pick, and grey out (without fully
   * disabling — a retry on a since-freed colour should still work) whatever
   * anyone else currently holds, so a click that would just get ignored by
   * the server never looks like it should have worked.
   */
  function markColorSelected(state: ArenaState, selfId: string, value: string): void {
    const taken = new Set<string>();
    for (const [sessionId, player] of state.players) {
      if (sessionId !== selfId) taken.add(player.color);
    }

    for (const swatch of colorEl.querySelectorAll<HTMLButtonElement>(".swatch")) {
      const swatchColor = swatch.dataset.value ?? "";
      swatch.classList.toggle("is-on", swatchColor === value);
      swatch.disabled = swatchColor !== value && taken.has(swatchColor);
    }
  }

  return {
    update(state, selfId, code) {
      el.hidden = false;
      isHost = state.hostId === selfId;
      const self = state.players.get(selfId);

      codeEl.textContent = code || "····";
      markSelected(roundsEl, state.totalRounds);
      markSelected(livesEl, state.livesPerRound);
      markColorSelected(state, selfId, self?.color ?? "");
      markHatSelected(self?.hat ?? "none");

      // Never overwrite what the host is mid-way through typing.
      if (!editingStake && stakeEl.value !== state.stake) stakeEl.value = state.stake;
      stakeEl.readOnly = !isHost;

      hintEl.textContent = isHost
        ? "Read the code out, or share the link. Start when everyone's in."
        : "Waiting for the host to start.";
    },
    hide() {
      el.hidden = true;
    },
    onConfigure(handler) {
      configureHandler = handler;
    },
    onCustomize(handler) {
      customizeHandler = handler;
    },
    onShare(handler) {
      shareHandler = handler;
    },
  };
}
