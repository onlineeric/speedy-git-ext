import { describe, it, expect } from 'vitest';
import {
  buildPushCommand,
  buildMergeCommand,
  buildRebaseCommand,
  buildCherryPickCommand,
  buildResetCommand,
  buildRevertCommand,
  buildDropCommitCommand,
  buildCheckoutCommand,
  buildTagCommand,
  buildPushTagCommand,
  buildDeleteBranchCommand,
  buildDeleteRemoteBranchCommand,
  buildDeleteTagCommand,
  buildDeleteTagWithRemoteCommand,
  buildDropStashCommand,
  buildStashAndCheckoutCommand,
  buildRenameBranchCommand,
  buildFastForwardLocalBranchCommand,
  buildPullCommand,
  buildCreateBranchCommand,
  buildAddWorktreeCommand,
  buildRemoveWorktreeCommand,
  buildPruneWorktreeCommand,
} from '../gitCommandBuilder';

describe('buildPushCommand', () => {
  it('builds default push command', () => {
    expect(buildPushCommand({ remote: 'origin', branch: 'main', setUpstream: false, forceMode: 'none' }))
      .toBe('git push origin main');
  });

  it('includes -u when setUpstream is true', () => {
    expect(buildPushCommand({ remote: 'origin', branch: 'main', setUpstream: true, forceMode: 'none' }))
      .toBe('git push -u origin main');
  });

  it('includes --force-with-lease', () => {
    expect(buildPushCommand({ remote: 'origin', branch: 'feat', setUpstream: false, forceMode: 'force-with-lease' }))
      .toBe('git push --force-with-lease origin feat');
  });

  it('includes --force', () => {
    expect(buildPushCommand({ remote: 'origin', branch: 'feat', setUpstream: false, forceMode: 'force' }))
      .toBe('git push --force origin feat');
  });

  it('combines -u and --force-with-lease', () => {
    expect(buildPushCommand({ remote: 'upstream', branch: 'dev', setUpstream: true, forceMode: 'force-with-lease' }))
      .toBe('git push -u --force-with-lease upstream dev');
  });
});

describe('buildMergeCommand', () => {
  it('builds default merge command', () => {
    expect(buildMergeCommand({ branch: 'feature', noCommit: false, noFastForward: false }))
      .toBe('git merge feature');
  });

  it('includes --no-ff alone', () => {
    expect(buildMergeCommand({ branch: 'feature', noCommit: false, noFastForward: true }))
      .toBe('git merge --no-ff feature');
  });

  it('includes --no-commit with implied --no-ff', () => {
    expect(buildMergeCommand({ branch: 'feature', noCommit: true, noFastForward: false }))
      .toBe('git merge --no-commit --no-ff feature');
  });

  it('includes --squash', () => {
    expect(buildMergeCommand({ branch: 'feature', noCommit: false, noFastForward: false, squash: true }))
      .toBe('git merge --squash feature');
  });

  it('combines --squash with --no-commit', () => {
    expect(buildMergeCommand({ branch: 'feature', noCommit: true, noFastForward: false, squash: true }))
      .toBe('git merge --squash --no-commit --no-ff feature');
  });
});

describe('buildRebaseCommand', () => {
  it('builds default rebase command', () => {
    expect(buildRebaseCommand({ targetRef: 'main', ignoreDate: false }))
      .toBe('git rebase main');
  });

  it('includes --ignore-date', () => {
    expect(buildRebaseCommand({ targetRef: 'origin/main', ignoreDate: true }))
      .toBe('git rebase --ignore-date origin/main');
  });
});

describe('buildCherryPickCommand', () => {
  it('builds single hash cherry-pick', () => {
    expect(buildCherryPickCommand({ hashes: ['abc1234'], appendSourceRef: false, noCommit: false }))
      .toBe('git cherry-pick abc1234');
  });

  it('builds multiple hash cherry-pick', () => {
    expect(buildCherryPickCommand({ hashes: ['abc1234', 'def5678'], appendSourceRef: false, noCommit: false }))
      .toBe('git cherry-pick abc1234 def5678');
  });

  it('includes -x when appendSourceRef is true', () => {
    expect(buildCherryPickCommand({ hashes: ['abc1234'], appendSourceRef: true, noCommit: false }))
      .toBe('git cherry-pick -x abc1234');
  });

  it('suppresses -x when noCommit is true', () => {
    expect(buildCherryPickCommand({ hashes: ['abc1234'], appendSourceRef: true, noCommit: true }))
      .toBe('git cherry-pick --no-commit abc1234');
  });

  it('includes -m N for mainlineParent', () => {
    expect(buildCherryPickCommand({ hashes: ['abc1234'], appendSourceRef: false, noCommit: false, mainlineParent: 1 }))
      .toBe('git cherry-pick -m 1 abc1234');
  });

  it('combines -m N and -x', () => {
    expect(buildCherryPickCommand({ hashes: ['abc1234'], appendSourceRef: true, noCommit: false, mainlineParent: 2 }))
      .toBe('git cherry-pick -m 2 -x abc1234');
  });
});

describe('buildResetCommand', () => {
  it('builds --soft reset', () => {
    expect(buildResetCommand({ hash: 'abc1234', mode: 'soft' }))
      .toBe('git reset --soft abc1234');
  });

  it('builds --mixed reset', () => {
    expect(buildResetCommand({ hash: 'abc1234', mode: 'mixed' }))
      .toBe('git reset --mixed abc1234');
  });

  it('builds --hard reset', () => {
    expect(buildResetCommand({ hash: 'abc1234', mode: 'hard' }))
      .toBe('git reset --hard abc1234');
  });
});

describe('buildRevertCommand', () => {
  describe('mode: commit', () => {
    it('builds revert --no-edit for non-merge commit', () => {
      expect(buildRevertCommand({ hash: 'abc1234', mode: 'commit' }))
        .toBe('git revert --no-edit abc1234');
    });

    it('includes -m N for merge commit', () => {
      expect(buildRevertCommand({ hash: 'abc1234', mode: 'commit', mainlineParent: 1 }))
        .toBe('git revert -m 1 --no-edit abc1234');
    });
  });

  describe('mode: no-commit', () => {
    it('builds revert --no-commit for non-merge commit', () => {
      expect(buildRevertCommand({ hash: 'abc1234', mode: 'no-commit' }))
        .toBe('git revert --no-commit abc1234');
    });

    it('includes -m N for merge commit', () => {
      expect(buildRevertCommand({ hash: 'abc1234', mode: 'no-commit', mainlineParent: 2 }))
        .toBe('git revert -m 2 --no-commit abc1234');
    });
  });

  describe('mode: edit-message', () => {
    it('builds native revert (no flag) for non-merge commit', () => {
      expect(buildRevertCommand({ hash: 'abc1234', mode: 'edit-message' }))
        .toBe('git revert abc1234');
    });

    it('includes -m N for merge commit', () => {
      expect(buildRevertCommand({ hash: 'abc1234', mode: 'edit-message', mainlineParent: 1 }))
        .toBe('git revert -m 1 abc1234');
    });
  });
});

describe('buildDropCommitCommand', () => {
  it('builds rebase-based drop command', () => {
    expect(buildDropCommitCommand({ hash: 'abc1234' }))
      .toBe('git rebase -i abc1234~1  # drop abc1234');
  });
});

describe('buildCheckoutCommand', () => {
  it('builds checkout without pull', () => {
    expect(buildCheckoutCommand({ branch: 'feature', pull: false }))
      .toBe('git checkout feature');
  });

  it('builds checkout with pull', () => {
    expect(buildCheckoutCommand({ branch: 'feature', pull: true }))
      .toBe('git checkout feature && git pull');
  });
});

describe('buildTagCommand', () => {
  it('builds lightweight tag', () => {
    expect(buildTagCommand({ name: 'v1.0.0', hash: 'abc1234' }))
      .toBe('git tag v1.0.0 abc1234');
  });

  it('builds annotated tag with message', () => {
    expect(buildTagCommand({ name: 'v1.0.0', hash: 'abc1234', message: 'Release 1.0.0' }))
      .toBe('git tag -a v1.0.0 -m "Release 1.0.0" abc1234');
  });

  it('escapes double quotes in annotation message', () => {
    expect(buildTagCommand({ name: 'v1.0.0', hash: 'abc1234', message: 'Release "v1"' }))
      .toBe('git tag -a v1.0.0 -m "Release \\"v1\\"" abc1234');
  });

  it('appends a chained push line when "also push" is on', () => {
    expect(buildTagCommand({ name: 'v1.0.0', hash: 'abc1234', push: { remote: 'origin' } }))
      .toBe('git tag v1.0.0 abc1234 && git push origin refs/tags/v1.0.0');
  });

  it('appends --force to the chained push when forced', () => {
    expect(buildTagCommand({ name: 'v1.0.0', hash: 'abc1234', message: 'r', push: { remote: 'origin', force: true } }))
      .toBe('git tag -a v1.0.0 -m "r" abc1234 && git push origin --force refs/tags/v1.0.0');
  });
});

describe('buildPushTagCommand', () => {
  it('builds a plain push-tag command', () => {
    expect(buildPushTagCommand({ name: 'v1.0.0', remote: 'origin' }))
      .toBe('git push origin refs/tags/v1.0.0');
  });

  it('inserts --force when forced', () => {
    expect(buildPushTagCommand({ name: 'v1.0.0', remote: 'upstream', force: true }))
      .toBe('git push upstream --force refs/tags/v1.0.0');
  });
});

describe('buildDeleteTagWithRemoteCommand', () => {
  it('chains local delete with remote delete', () => {
    expect(buildDeleteTagWithRemoteCommand({ name: 'v1.0.0', remote: 'origin' }))
      .toBe('git tag -d v1.0.0 && git push origin --delete v1.0.0');
  });
});

describe('buildDeleteBranchCommand', () => {
  it('builds default delete branch command', () => {
    expect(buildDeleteBranchCommand({ name: 'feature' }))
      .toBe('git branch -d feature');
  });

  it('builds force delete branch command', () => {
    expect(buildDeleteBranchCommand({ name: 'feature', force: true }))
      .toBe('git branch -D feature');
  });
});

describe('buildDeleteRemoteBranchCommand', () => {
  it('builds delete remote branch command', () => {
    expect(buildDeleteRemoteBranchCommand({ remote: 'origin', name: 'feature' }))
      .toBe('git push origin --delete feature');
  });
});

describe('buildDeleteTagCommand', () => {
  it('builds delete tag command', () => {
    expect(buildDeleteTagCommand({ name: 'v1.0.0' }))
      .toBe('git tag -d v1.0.0');
  });
});

describe('buildDropStashCommand', () => {
  it('builds drop stash command', () => {
    expect(buildDropStashCommand({ stashIndex: 0 }))
      .toBe('git stash drop stash@{0}');
  });

  it('builds drop stash command with higher index', () => {
    expect(buildDropStashCommand({ stashIndex: 3 }))
      .toBe('git stash drop stash@{3}');
  });
});

describe('buildStashAndCheckoutCommand', () => {
  it('builds stash and checkout without pull', () => {
    expect(buildStashAndCheckoutCommand({ branch: 'feature', pull: false }))
      .toBe('git stash && git checkout feature');
  });

  it('builds stash and checkout with pull', () => {
    expect(buildStashAndCheckoutCommand({ branch: 'feature', pull: true }))
      .toBe('git stash && git checkout feature && git pull');
  });
});

describe('buildRenameBranchCommand', () => {
  it('builds rename branch command', () => {
    expect(buildRenameBranchCommand({ oldName: 'old-branch', newName: 'new-branch' }))
      .toBe('git branch -m old-branch new-branch');
  });
});

describe('buildCreateBranchCommand', () => {
  it('builds create branch command without checkout', () => {
    expect(buildCreateBranchCommand({ name: 'feature/foo', startPoint: 'abc123', checkout: false }))
      .toBe('git branch feature/foo abc123');
  });

  it('appends checkout when checkout is true', () => {
    expect(buildCreateBranchCommand({ name: 'feature/foo', startPoint: 'abc123', checkout: true }))
      .toBe('git branch feature/foo abc123 && git checkout feature/foo');
  });
});

describe('buildFastForwardLocalBranchCommand', () => {
  it('builds the refspec form against origin', () => {
    expect(buildFastForwardLocalBranchCommand({ remote: 'origin', branch: 'dev' }))
      .toBe('git fetch origin dev:dev');
  });

  it('preserves slashes in branch names', () => {
    expect(buildFastForwardLocalBranchCommand({ remote: 'origin', branch: 'release/1.2.x' }))
      .toBe('git fetch origin release/1.2.x:release/1.2.x');
  });

  it('uses a non-default remote when provided', () => {
    expect(buildFastForwardLocalBranchCommand({ remote: 'upstream', branch: 'main' }))
      .toBe('git fetch upstream main:main');
  });

  it('appends set-upstream when setUpstream is true', () => {
    expect(buildFastForwardLocalBranchCommand({ remote: 'origin', branch: 'dev', setUpstream: true }))
      .toBe('git fetch origin dev:dev && git branch --set-upstream-to=origin/dev dev');
  });

  it('omits set-upstream when setUpstream is false', () => {
    expect(buildFastForwardLocalBranchCommand({ remote: 'origin', branch: 'dev', setUpstream: false }))
      .toBe('git fetch origin dev:dev');
  });
});

describe('buildPullCommand', () => {
  it('builds an explicit remote/branch pull', () => {
    expect(buildPullCommand({ remote: 'origin', branch: 'main' }))
      .toBe('git pull origin main');
  });

  it('uses a non-default remote when provided', () => {
    expect(buildPullCommand({ remote: 'upstream', branch: 'release/1.2.x' }))
      .toBe('git pull upstream release/1.2.x');
  });
});

describe('buildAddWorktreeCommand', () => {
  it('builds the existing-branch form', () => {
    expect(buildAddWorktreeCommand({ path: '/wt/feature', ref: 'feature', branchMode: 'existing' }))
      .toBe('git worktree add /wt/feature feature');
  });

  it('builds the new-branch form with -b', () => {
    expect(buildAddWorktreeCommand({ path: '/wt/x', ref: 'origin/x', branchMode: 'new', newBranchName: 'x' }))
      .toBe('git worktree add -b x /wt/x origin/x');
  });

  it('builds the detached form with --detach', () => {
    expect(buildAddWorktreeCommand({ path: '/wt/d', ref: 'abc1234', branchMode: 'detached' }))
      .toBe('git worktree add --detach /wt/d abc1234');
  });

  it('inserts --force after add', () => {
    expect(buildAddWorktreeCommand({ path: '/wt/f', ref: 'feature', branchMode: 'existing', force: true }))
      .toBe('git worktree add --force /wt/f feature');
  });

  it('quotes paths containing spaces', () => {
    expect(buildAddWorktreeCommand({ path: '/my worktrees/feat', ref: 'feat', branchMode: 'existing' }))
      .toBe('git worktree add "/my worktrees/feat" feat');
  });

  it('derives a remote-tracking new-branch form for remote-only sources', () => {
    expect(buildAddWorktreeCommand({ path: '/wt/release', ref: 'origin/release', branchMode: 'new', newBranchName: 'release' }))
      .toBe('git worktree add -b release /wt/release origin/release');
  });
});

describe('buildRemoveWorktreeCommand', () => {
  it('builds the plain remove form', () => {
    expect(buildRemoveWorktreeCommand({ path: '/wt/feature' }))
      .toBe('git worktree remove /wt/feature');
  });

  it('includes --force when requested', () => {
    expect(buildRemoveWorktreeCommand({ path: '/wt/feature', force: true }))
      .toBe('git worktree remove --force /wt/feature');
  });

  it('quotes paths with spaces', () => {
    expect(buildRemoveWorktreeCommand({ path: '/my worktrees/feat' }))
      .toBe('git worktree remove "/my worktrees/feat"');
  });
});

describe('buildPruneWorktreeCommand', () => {
  it('builds the prune command', () => {
    expect(buildPruneWorktreeCommand()).toBe('git worktree prune');
  });
});
