# Ad Fontes Manager - Agent Guide

> **Quick Start**: Read `.opencode/skills/ad-fontes/SKILL.md` first

## How to Use This Guide

This project uses a **skill-based documentation system** to avoid context pollution. Instead of loading all documentation at once, agents load specific guides based on their current task.

## 📚 Skill Structure

```
.opencode/skills/ad-fontes/
├── SKILL.md              # Entry point (always read first)
├── getting-started.md    # First-time setup
├── backend-patterns.md   # Express/API development
├── frontend-patterns.md  # Vue 3/frontend development
├── database-guide.md     # PostgreSQL/SQL patterns
├── security-guide.md     # Authentication/security
└── troubleshooting.md    # Debugging common issues
```

## 🎯 Quick Reference

**When starting work:**
1. Read `SKILL.md` for project overview
2. Based on your task, load the specific sub-guide

**Task → Guide Mapping:**

| Task | Load This Guide |
|------|----------------|
| First time on project | `getting-started.md` |
| Backend/API work | `backend-patterns.md` |
| Frontend/Vue work | `frontend-patterns.md` |
| Database changes | `database-guide.md` |
| Security review | `security-guide.md` |
| Debugging bugs | `troubleshooting.md` |

## 📖 Key Documents

**Project Overview:**
- `README.md` - High-level project info
- `PROJECT_DIAGNOSTIC_REPORT.md` - Known issues (287 `any` usages, etc.)
- `docs/` - Detailed documentation (API, DATABASE, SECURITY, etc.)

**Configuration:**
- `.env.example` - Environment template
- `schema.sql` - Database schema

## 🚀 Development Commands

```bash
# Setup (first time)
cd web && npm install
cd client && npm install

# Development
npm run dev              # Both frontend + backend
npm run dev:server       # Backend only
npm run dev:client       # Frontend only

# Quality checks
npm run type-check       # TypeScript check
npm run lint            # ESLint
npm run format          # Prettier

# Tests
cd client && npm run test
```

## ⚠️ Critical Rules

1. **Always read SKILL.md first** when starting
2. **Check PROJECT_DIAGNOSTIC_REPORT.md** before major changes
3. **Never commit `.env` files**
4. **Run type-check before committing**
5. **Replace `any` with proper types** when modifying code

## 🔗 External Resources

- Vue 3: https://vuejs.org/
- Express: https://expressjs.com/
- Pinia: https://pinia.vuejs.org/
- PostgreSQL: https://www.postgresql.org/docs/

---

**For detailed instructions, see the skill files in `.opencode/skills/ad-fontes/`**
