const GIT_COMMAND = /(?:^|[\s;&|()])(?:[^\s;&|()]*\/)?git(?=$|[\s;&|()])/mu;

const VCS_COMMAND =
  /(?:^|[\s;&|()])(?:[^\s;&|()]*\/)?(?:git|jj)(?=$|[\s;&|()])/mu;

const NO_VERIFY = /--no-verify(?=$|[\s;&|()])/mu;

const COMMAND_SEPARATOR = /[;&|()\n]+/u;

const GIT_WORD = /(?:^|\/)git$/u;

const SHORT_NO_VERIFY = /^-[A-Za-z]*n[A-Za-z]*$/u;

const HOOK_ENV = /^LEFTHOOK=(?:0|false)$/u;

const HOOKS_PATH = /core\.hookspath/iu;

const GIT_OPTIONS_WITH_VALUE = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
]);

/**
 * @param {string} segment
 * @returns {boolean}
 */
const skipsHooks = (segment) => {
  const words = segment.trim().split(/\s+/u);
  const git = words.findIndex((word) => GIT_WORD.test(word));

  if (git === -1) {
    return false;
  }

  if (words.slice(0, git).some((word) => HOOK_ENV.test(word))) {
    return true;
  }

  let index = git + 1;
  let word = words[index] ?? "";

  while (word.startsWith("-")) {
    if (HOOKS_PATH.test(word) || HOOKS_PATH.test(words[index + 1] ?? "")) {
      return true;
    }

    index += GIT_OPTIONS_WITH_VALUE.has(word) ? 2 : 1;
    word = words[index] ?? "";
  }

  return (
    word === "commit" &&
    words.slice(index + 1).some((option) => SHORT_NO_VERIFY.test(option))
  );
};

export const NONINTERACTIVE_VCS_ENV =
  "export GIT_EDITOR=: GIT_SEQUENCE_EDITOR=: GIT_MERGE_AUTOEDIT=no JJ_EDITOR=:\n";

export const HOOK_BYPASS_REASON =
  "Blocked hook bypass: this git command skips the hooks with `--no-verify`, `commit -n`, `LEFTHOOK=0`, or a `core.hooksPath` override. The hooks run `pnpm check` and `pnpm test`, the fence every commit must pass. Fix: drop the bypass, read the hook output, and fix the failure; ask the owner before changing `lefthook.yml`.";

/** @typedef {{ action: "allow"; command: string } | { action: "block"; reason: string }} CommandPolicyResult */

/**
 * @param {string} command
 * @returns {CommandPolicyResult}
 */
export const applyCommandPolicy = (command) => {
  if (
    GIT_COMMAND.test(command) &&
    (NO_VERIFY.test(command) ||
      command.split(COMMAND_SEPARATOR).some(skipsHooks))
  ) {
    return { action: "block", reason: HOOK_BYPASS_REASON };
  }

  if (!VCS_COMMAND.test(command)) {
    return { action: "allow", command };
  }

  return {
    action: "allow",
    command: `${NONINTERACTIVE_VCS_ENV}${command}`,
  };
};
