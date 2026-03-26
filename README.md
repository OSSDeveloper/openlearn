# 🧠 openlearn

**⚡ The self-correcting memory layer for coding agents.**

Your agent is smart.  
But it has amnesia.

It solves the same damn problem 47 times.  
Permission errors. Docker cache bullshit. Wrong file paths. Network quirks.

**openlearn ends that forever.** 🚀

It watches failures, understands *why* they happen, turns them into hard constraints, and injects the fix **before** you waste another cycle.

No more repeating mistakes.  
Just relentless progress.

> 🧱 **Physics Over Prompts**: An agent skill is a wish. openlearn is gravity. You can't write enough system prompts to stop a distracted language model from repeating a mistake. You can build a trap it mathematically cannot escape. We chose the trap.

---

## ⚙️ Installation (Takes 2 Minutes)

```bash
npm install -g @ossdeveloper/openlearn
```

Then add to your `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["@ossdeveloper/openlearn"],
  "mcp": {
    "openlearn": {
      "type": "local",
      "command": ["openlearn-mcp"]
    }
  }
}
```

Restart OpenCode. Done. ✅

It runs locally. Your lessons stay on your machine. No cloud. No bullshit. 🛡️

---

## 🚨 The Problem

**Before openlearn:**
- Session 1: Agent hits Docker cache bug. You fix it manually. 45 min lost.
- Session 2: Same Docker bug. Agent has no memory. You fix it again. 45 min lost.
- Session 47: *Same. Exact. Bug.*

**After openlearn:**
- Session 1: Agent hits Docker bug. openlearn captures it.
- Session 2 onwards: Constraint auto-injected before the agent even tries. Bug never happens again. ⚡

---

## 🛠️ How It Works (Simple & Brutal)

1. ❌ Agent tries something → fails
2. 🔍 openlearn analyzes root cause
3. 🛡️ Converts failure into **actionable constraint**
4. ✨ Next time the same situation appears → constraint is injected automatically

**Result:** The best error is the one you only see **once**. 🎯

---

## 🎛️ Learning Modes (Choose Your Risk Level)

| Mode     | Behavior                          | When to Use                     |
|----------|-----------------------------------|---------------------------------|
| `full`   | Auto-learn + auto-inject          | ⚡ Solo devs who want maximum speed |
| `suggest`| Learn but require human approval  | 🛡️ Teams & production safety       |
| `off`    | No new learning                   | 🔒 When you want read-only mode    |

Set it with:  
`openlearn: config set learningMode suggest`

---

## ✨ Hidden Superpowers

openlearn isn't a dumb log file. It’s engineered from first principles to act as an autonomous neural net for your local machine:

- 🧠 **Instant Pattern Recognition**: It doesn't rely on cloud servers or slow APIs. It runs a lightning-fast mathematical engine locally on your hardware to match the exact physics of an error the moment it happens.
- 🛡️ **Absolute Privacy**: Before a mistake even enters its memory, it mathematically strips out your passwords, API keys, and local paths. Paranoid-level security by default. Your data stays yours.
- ⏳ **Organic Forgetting**: Agents shouldn't be bogged down by stale hacks. If a fix hasn't been useful in months, the system slowly lets its confidence decay. It only remembers what's actually critical for survival.
- ⏪ **Time Travel**: Every rule it learns is permanently tracked on an immutable timeline. If a new rule makes things worse, you can hit undo and revert the agent's brain to a previously stable state instantly.
- 🌍 **Environmental Quarantine**: It understands physical boundaries. Weird quirks from your Python backend don't cross-contaminate your React frontend. It isolates its memory strictly to the project you're working in.
- 📡 **Hive Mind Telepathy**: If it battles a vicious Docker bug in Project A, it fundamentally absorbs the truth of that failure. When Project B inevitably hits that same wall, the fix instantly teleports over. You solve an error once, across everything.

---

## 🎯 What openlearn Actually Learns

Real patterns from the codebase — not hand-written rules:

| When agent hits... | openlearn hard-injects... |
|---|---|
| `permission denied` | `Use sudo or check file permissions` |
| `no such file or directory` | `Verify file path exists before operation` |
| `docker ... failed` | `Rebuild without cache, ensure Dockerfile exists` |
| `ssh: connect to host ...` | `Verify key permissions (chmod 600), check host key acceptance` |
| `connection timeout` | `Check network connectivity and endpoint availability` |
| `401 unauthorized` | `Verify credentials and authentication tokens` |

- ✅ **Successful Tool Sequences** — learns that *your* project always does `git add . → git commit → git push` and surfaces it when relevant.
- 📂 **Workspace Conventions** — picks up your naming patterns, preferred flags, project-specific workflows automatically.

It doesn't log errors. It builds a **living model** 🧠 of how *your* machine and projects actually behave.

---

## 💻 Commands (OpenCode Slash Commands)

Type `/` in OpenCode chat and you'll see these appear:

| Slash Command | What it does |
|---|---|
| `/openlearn` | OpenLearn — self-correcting memory layer (help) |
| `/openlearn-list` | List all lessons and learnings |
| `/openlearn-review` | Interactively review and approve/reject pending lessons |
| `/openlearn-approve` | Approve a specific pending lesson by ID |
| `/openlearn-reject` | Reject a specific pending lesson by ID |
| `/openlearn-history` | Show version history of a lesson |
| `/openlearn-rollback` | Rollback a lesson to a previous version |
| `/openlearn-export` | Export all openlearn data as JSON |
| `/openlearn-import` | Import data from a JSON backup |
| `/openlearn-config` | Show or modify configuration |
| `/openlearn-clear` | Clear openlearn data (lessons / pending / all) |

**What `/openlearn-list` looks like in practice:**

```
📚 openlearn Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode: 📖 Learning + auto-inject
Auto-inject threshold: 70%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Lessons: 12
  🟢 High: 8 | 🟡 Medium: 3 | 🔴 Low: 1
⏳ Pending: 2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sequences: 4 | Conventions: 6
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Run /openlearn-list [filter=all] for full list
Run /openlearn-list [filter=pending] for pending review
```

🟢 = High confidence (auto-injected) | 🟡 = Learning | 🔴 = Weak, fading out

---

## 🔮 Vision

This is just the beginning.

Imagine agents that **never** forget your environment. 🌌  
That compound knowledge across weeks and months. 📈  
That become true extensions of *you*. 🦾

openlearn is the memory upgrade the entire agent ecosystem needs.

---

## 🤝 Get Involved

- ⭐ Star the repo if this resonates
- 🧪 Try it in `suggest` mode first
- 💬 Share the weirdest error your agent keeps repeating — we'll make openlearn learn it

Built with obsession for eliminating repetitive friction in agentic coding. ❤️


**Let's make coding agents actually intelligent — not just fast.** 🚀

---

**📦 Repository**: [github.com/OSSDeveloper/openlearn](https://github.com/OSSDeveloper/openlearn)  
**🔖 Version**: 2.0.5  
**📄 License**: MIT