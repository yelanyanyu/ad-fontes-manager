# 编辑器配置指南

本文档介绍如何配置编辑器以支持 ESLint 和 Prettier，实现保存时自动修复代码格式。

## 推荐的编辑器插件

### Visual Studio Code

1. **安装插件**
   - ESLint: `dbaeumer.vscode-eslint`
   - Prettier: `esbenp.prettier-vscode`

2. **配置 settings.json**

   打开 VS Code 设置 (Ctrl+,)，搜索并启用以下设置，或直接在 `settings.json` 中添加：

   ```json
   {
     "editor.formatOnSave": true,
     "editor.defaultFormatter": "esbenp.prettier-vscode",
     "editor.codeActionsOnSave": {
       "source.fixAll.eslint": "explicit"
     },
     "eslint.validate": [
       "javascript",
       "javascriptreact",
       "typescript",
       "typescriptreact",
       "vue"
     ],
     "eslint.workingDirectories": [
       { "pattern": "./node/" },
       { "pattern": "./web/" },
       { "pattern": "./web/client/" }
     ],
     "prettier.requireConfig": true
   }
   ```

3. **项目级配置（可选）**

   在项目根目录创建 `.vscode/settings.json`：

   ```json
   {
     "editor.formatOnSave": true,
     "editor.defaultFormatter": "esbenp.prettier-vscode",
     "editor.codeActionsOnSave": {
       "source.fixAll.eslint": "explicit"
     }
   }
   ```

### WebStorm / IntelliJ IDEA

1. **启用 ESLint**
   - 打开 Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint
   - 选择 "Automatic ESLint configuration"
   - 勾选 "Run eslint --fix on save"

2. **配置 Prettier**
   - 打开 Settings → Languages & Frameworks → JavaScript → Prettier
   - 启用 "On save" 选项
   - 确保 "Run for files" 包含 `{**/*,*}.{js,ts,jsx,tsx,vue}`

### Vim / Neovim

使用 [coc.nvim](https://github.com/neoclide/coc.nvim) 或 [nvim-lspconfig](https://github.com/neovim/nvim-lspconfig)：

```vim
" coc.nvim 配置示例
let g:coc_global_extensions = ['coc-eslint', 'coc-prettier']

" 保存时自动修复
autocmd BufWritePre *.js,*.ts,*.vue silent! call CocAction('runCommand', 'eslint.executeAutofix')
```

## 手动运行代码检查

如果编辑器自动修复不工作，可以手动运行：

```bash
# 检查所有文件
cd node && npm run lint
cd web && npm run lint
cd web/client && npm run lint

# 自动修复
cd node && npm run lint:fix
cd web && npm run lint:fix
cd web/client && npm run lint:fix

# 格式化代码
cd node && npm run format
cd web && npm run format
cd web/client && npm run format
```

## 预提交钩子（可选）

可以使用 husky 和 lint-staged 在提交前自动运行代码检查：

```bash
# 安装依赖
npm install --save-dev husky lint-staged

# 初始化 husky
npx husky init
```

在 package.json 中添加：

```json
{
  "lint-staged": {
    "*.{js,ts,vue}": ["eslint --fix", "prettier --write"]
  }
}
```

创建 `.husky/pre-commit`：

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
```

## 故障排除

### ESLint 无法识别配置文件

确保 ESLint 版本 >= 9.0.0，并且使用 Flat Config 格式 (`eslint.config.mjs`)。

### Prettier 格式与 ESLint 冲突

项目中已配置 `eslint-config-prettier` 来禁用与 Prettier 冲突的 ESLint 规则。如果仍有问题，检查：

1. `.prettierrc` 文件是否存在
2. 编辑器中 Prettier 插件是否使用项目配置

### Vue 文件解析错误

确保已安装 `vue-eslint-parser` 并在 `eslint.config.mjs` 中正确配置。

## 相关文件

- `eslint.config.mjs` - ESLint Flat Config 配置
- `.prettierrc` - Prettier 配置
- `package.json` - npm 脚本定义
