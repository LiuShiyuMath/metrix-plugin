1. Make https://github.com/libz-renlab-ai/TeamBrain into a claude plugin market place 
2. Architecture : 
	teamagent-marketplace/
  .claude-plugin/
    marketplace.json

  plugins/
    teamagent-memory/
      .claude-plugin/plugin.json
      skills/
        capture-correction/SKILL.md
        explain-rule-hit/SKILL.md
        review-new-rules/SKILL.md
      hooks/
        hooks.json
        pretooluse-enforce.cjs
        stop-capture.cjs
        userprompt-inject.cjs
      bin/
        teamagent
      README.md

    teamagent-proof-console/
      .claude-plugin/plugin.json
      skills/
        generate-proof-packet/SKILL.md
        audit-feature-evidence/SKILL.md
        ceo-proof-summary/SKILL.md
      commands/
        proof.md
      README.md

    teamagent-team-sync/
      .claude-plugin/plugin.json
      skills/
        publish-team-rule/SKILL.md
        resolve-rule-conflict/SKILL.md
        promote-project-rule/SKILL.md
      hooks/
        hooks.json
        sessionstart-sync.cjs
        userprompt-publish.cjs
      README.md
3. 1. Alice 在 Claude Code 里犯错：想装 moment。
2. User 纠正：不要 moment，用 dayjs。
3. TeamAgent Stop hook 抓到 correction moment。
4. TeamAgent 生成 rule card：trigger / wrong / correct / why / confidence。
5. 新 Claude Code session 里，Bob 又想写 moment。
6. PreToolUse 在执行前 block / warn。
7. Dashboard 显示：saved one repeat mistake, rule confidence +1。
8. CEO 看到证据：transcript, rule card, hook event, before/after diff。


“Previous Claude Code made this mistake. New Claude Code tried to repeat it. TeamAgent blocked it.”

4. the repo strcutre follows :
	- https://github.com/anthropics/claude-plugins-official
	- https://github.com/obra/superpowers
5. verification :
	- !claude -h 
	- !claudefast -p 
	- claudefast streamjson for detailed audit 
	- claduefast --plugin-dir to A/B test 
6. Everytime you make big changes ,make a video as a proof of work with:
	1. tmux + claudefast for interactive testing 
	2. claudefast + streamjson for audit level testing 
