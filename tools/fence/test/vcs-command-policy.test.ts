import { describe, expect, it } from "vitest";

import {
  applyCommandPolicy,
  HOOK_BYPASS_REASON,
  NONINTERACTIVE_VCS_ENV,
} from "../../../scripts/vcs-command-policy.js";

describe("vcs command policy", () => {
  it("leaves unrelated shell commands unchanged", () => {
    expect(applyCommandPolicy("pnpm test")).toEqual({
      action: "allow",
      command: "pnpm test",
    });
  });

  it("prevents Git from opening an editor", () => {
    expect(applyCommandPolicy("cd repo && git rebase -i HEAD~2")).toEqual({
      action: "allow",
      command: `${NONINTERACTIVE_VCS_ENV}cd repo && git rebase -i HEAD~2`,
    });
  });

  it("also prevents Jujutsu from opening an editor", () => {
    expect(applyCommandPolicy("jj describe")).toEqual({
      action: "allow",
      command: `${NONINTERACTIVE_VCS_ENV}jj describe`,
    });
  });

  it("recognizes an absolute Git executable", () => {
    expect(applyCommandPolicy("/usr/bin/git status")).toEqual({
      action: "allow",
      command: `${NONINTERACTIVE_VCS_ENV}/usr/bin/git status`,
    });
  });

  it("blocks hook bypass attempts", () => {
    expect(applyCommandPolicy("git commit --no-verify -m nope")).toEqual({
      action: "block",
      reason: HOOK_BYPASS_REASON,
    });
  });

  it.each([
    "git commit -n -m nope",
    "git commit -anm nope",
    "git add . && git commit -m nope -n",
    "LEFTHOOK=0 git commit -m nope",
    "LEFTHOOK=false git commit -m nope",
    "git -c core.hooksPath=/dev/null commit -m nope",
    "git -c core.hooksPath /dev/null commit -m nope",
    "git push --no-verify",
  ])("blocks the hook bypass in %s", (command) => {
    expect(applyCommandPolicy(command)).toEqual({
      action: "block",
      reason: HOOK_BYPASS_REASON,
    });
  });

  it.each([
    "git log -n 5",
    "git push -n origin main",
    "git merge -n feature",
    "git -C repo commit -m ready",
    "LEFTHOOK_VERBOSE=1 git commit -m ready",
  ])("allows %s", (command) => {
    expect(applyCommandPolicy(command)).toEqual({
      action: "allow",
      command: `${NONINTERACTIVE_VCS_ENV}${command}`,
    });
  });

  it("does not block an unrelated no-verify option", () => {
    expect(applyCommandPolicy("some-tool --no-verify")).toEqual({
      action: "allow",
      command: "some-tool --no-verify",
    });
  });
});
