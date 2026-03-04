# TypeScript 迁移指南

本文档介绍如何将项目从 JavaScript 迁移到 TypeScript。当前配置已为 TypeScript 迁移预留了平滑过渡路径。

## 当前配置状态

项目已配置以下 TypeScript 支持：

1. **ESLint 9 Flat Config** 格式 - 支持 TypeScript 的现代配置方式
2. **@typescript-eslint/parser** - 已安装，用于解析 TypeScript 语法
3. **文件匹配** - ESLint 配置已包含 `.ts`, `.mts`, `.cts` 文件扩展名
4. **无类型检查** - 当前未启用类型检查，仅解析语法

## 迁移步骤

### 第一步：创建 tsconfig.json

在每个子项目中创建 `tsconfig.json` 文件：

**node/tsconfig.json:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**web/tsconfig.json:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist", "client"]
}
```

**web/client/tsconfig.json:**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**web/client/tsconfig.node.json:**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.js"]
}
```

### 第二步：启用 ESLint 类型感知规则

更新 `eslint.config.mjs`，添加 `project` 字段启用类型检查：

```javascript
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  js.configs.recommended,
  prettier,
  {
    files: ['**/*.ts', '**/*.mts', '**/*.cts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json', // 启用类型感知
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...tsPlugin.configs['recommended-type-checked'].rules,
      'prettier/prettier': 'error',
    },
  },
  // ... 保留 JS 文件配置
];
```

### 第三步：安装 TypeScript 依赖

```bash
# 在每个子项目中运行
npm install --save-dev typescript @typescript-eslint/eslint-plugin

# 对于 Vue 项目
npm install --save-dev vue-tsc
```

### 第四步：逐步迁移文件

1. **重命名文件**: 将 `.js` 文件重命名为 `.ts`
2. **添加类型注解**: 为函数参数和返回值添加类型
3. **修复类型错误**: 运行 `tsc --noEmit` 检查类型错误

示例迁移：

**Before (JavaScript):**

```javascript
// utils.js
export function add(a, b) {
  return a + b;
}
```

**After (TypeScript):**

```typescript
// utils.ts
export function add(a: number, b: number): number {
  return a + b;
}
```

### 第五步：更新构建脚本

更新 `package.json` 中的脚本：

```json
{
  "scripts": {
    "build": "tsc && vite build",
    "type-check": "tsc --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```

## 迁移策略建议

### 1. 渐进式迁移

- 不要一次性迁移所有文件
- 优先迁移核心模块和工具函数
- 保持 `.js` 和 `.ts` 文件共存

### 2. 严格模式配置

初始 `tsconfig.json` 可以设置：

```json
{
  "compilerOptions": {
    "strict": false,
    "noImplicitAny": false,
    "strictNullChecks": false
  }
}
```

逐步启用严格选项：

```json
{
  "compilerOptions": {
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strict": true
  }
}
```

### 3. 类型声明文件

对于第三方库缺少类型定义的情况：

```bash
npm install --save-dev @types/lodash
```

或创建声明文件 `types.d.ts`：

```typescript
declare module 'some-untyped-module' {
  export function doSomething(): void;
}
```

## 当前已准备的配置

### ESLint 配置特点

1. **Flat Config 格式** - ESLint 9 的现代配置方式
2. **TypeScript 解析器** - 已配置 `@typescript-eslint/parser`
3. **文件扩展名** - 已包含 `.ts`, `.mts`, `.cts`
4. **无 project 字段** - 当前不启用类型检查，避免迁移前的错误

### 需要添加的依赖

迁移时需要安装：

```bash
npm install --save-dev \
  typescript \
  @typescript-eslint/eslint-plugin \
  @types/node
```

Vue 项目额外需要：

```bash
npm install --save-dev \
  vue-tsc \
  @vitejs/plugin-vue
```

## 验证迁移

### 类型检查

```bash
# 检查所有文件
npx tsc --noEmit

# 监视模式
npx tsc --noEmit --watch
```

### ESLint 检查

```bash
npm run lint
```

### 测试

```bash
npm test
```

## 常见问题

### Q: 迁移后 ESLint 报错太多？

A: 可以暂时禁用严格规则，逐步启用：

```javascript
// eslint.config.mjs
rules: {
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/no-unused-vars': 'warn',
}
```

### Q: Vue 单文件组件如何迁移？

A: 重命名为 `.vue` 文件，在 `<script>` 标签添加 `lang="ts"`：

```vue
<script setup lang="ts">
import { ref } from 'vue';

const count = ref<number>(0);
</script>
```

### Q: 如何保持 JS 和 TS 共存？

A: 当前配置已支持，ESLint 会同时检查两种文件类型。逐步将 `.js` 重命名为 `.ts` 即可。

## 参考资源

- [TypeScript 官方文档](https://www.typescriptlang.org/docs/)
- [TypeScript ESLint 指南](https://typescript-eslint.io/getting-started/)
- [Vue TypeScript 支持](https://vuejs.org/guide/typescript/overview.html)
- [Node.js TypeScript 指南](https://nodejs.org/en/learn/typescript/)
