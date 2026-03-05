# 代码注释规范

本文档定义了项目中 Vue 组件的代码注释规范，旨在提高代码可读性和可维护性。

---

## 目录

- [注释风格指南](#注释风格指南)
- [Vue 组件注释模板](#vue-组件注释模板)
- [注释示例](#注释示例)
- [最佳实践](#最佳实践)

---

## 注释风格指南

### 使用 JSDoc/TSDoc 规范

所有注释遵循 [JSDoc](https://jsdoc.app/) / [TSDoc](https://tsdoc.org/) 规范，使用 `/** */` 多行注释格式。

### 注释位置

| 代码元素 | 注释位置 | 格式 |
|---------|---------|------|
| 文件头 | 文件最开头 | `/** @file */` |
| 组件说明 | `<script>` 前或文件头 | `/** @component */` |
| 变量/常量 | 声明前一行 | `/** 描述 */` |
| 函数/方法 | 定义前一行 | `/** @function */` |
| 计算属性 | 定义前一行 | `/** @computed */` |
| Props | 定义前一行 | `/** @property */` |
| Emits | 定义前一行 | `/** @emits */` |

---

## Vue 组件注释模板

### 文件头模板

```vue
<!--
/**
 * @file ComponentName.vue
 * @description 组件的简短描述
 *
 * @component ComponentName
 * @description 组件的详细描述，说明用途和功能
 *
 * @example
 * ```vue
 * <template>
 *   <ComponentName :prop="value" @event="handler" />
 * </template>
 *
 * <script setup>
 * import ComponentName from '@/components/Path/ComponentName.vue'
 * </script>
 * ```
 *
 * @features
 * - 功能点 1：描述
 * - 功能点 2：描述
 *
 * @dependencies
 * - vue: Vue 3 Composition API
 * - @/stores/storeName: 状态管理
 * - @/components/OtherComponent.vue: 子组件
 *
 * @author Team Name
 * @version 1.0.0
 */
-->
```

### Script 部分模板

```vue
<script setup>
/**
 * @file ComponentName.vue
 * @description 组件描述
 */

import { ref, computed } from 'vue'
import { useStore } from '@/stores/store'

/**
 * 状态管理实例
 * @type {ReturnType<typeof useStore>}
 */
const store = useStore()

/**
 * 响应式状态描述
 * @type {import('vue').Ref<Type>}
 * @default defaultValue
 */
const state = ref(initialValue)

/**
 * 计算属性描述
 * @computed
 * @returns {ReturnType} 返回值描述
 */
const computedValue = computed(() => {
  return state.value
})

/**
 * 函数描述
 * @function functionName
 * @param {Type} paramName - 参数描述
 * @returns {ReturnType} 返回值描述
 */
const functionName = (paramName) => {
  // 实现
}
</script>
```

### Props 注释模板

```vue
<script setup>
/**
 * 组件 Props 定义
 * @property {string} propName - 属性描述
 * @property {number} [optionalProp] - 可选属性描述
 * @property {boolean} propWithDefault - 带默认值的属性
 * @default true
 */
const props = defineProps({
  propName: {
    type: String,
    required: true
  },
  optionalProp: {
    type: Number,
    default: 0
  },
  propWithDefault: {
    type: Boolean,
    default: true
  }
})
</script>
```

### Emits 注释模板

```vue
<script setup>
/**
 * 组件事件定义
 * @emits eventName - 事件描述
 * @param {Type} payload - 事件参数描述
 */
const emit = defineEmits(['eventName', 'otherEvent'])
</script>
```

---

## 注释示例

### 简单组件示例

```vue
<!--
/**
 * @file Header.vue
 * @description 应用顶部导航栏组件
 *
 * @component Header
 * @description 应用顶部导航栏，显示 Logo 和标题
 *
 * @example
 * ```vue
 * <template>
 *   <Header />
 * </template>
 *
 * <script setup>
 * import Header from '@/components/Layout/Header.vue'
 * </script>
 * ```
 *
 * @dependencies
 * - 静态资源：/logo.svg - 应用 Logo 图片
 * - 样式框架：Tailwind CSS
 *
 * @features
 * - 显示应用 Logo 和标题
 * - 固定在页面顶部
 */
-->
<template>
  <header class="bg-white border-b h-16 flex items-center px-6">
    <img src="/logo.svg" alt="Logo" />
    <h1>Etymos</h1>
  </header>
</template>
```

### 带状态和方法的组件示例

```vue
<script setup>
/**
 * @file Sidebar.vue
 * @description 应用侧边导航栏组件
 */

import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'

/**
 * 应用状态管理实例
 * @type {ReturnType<typeof useAppStore>}
 */
const appStore = useAppStore()

/**
 * 侧边栏展开状态
 * @description 控制侧边栏的展开(true)或收起(false)
 * @type {import('vue').Ref<boolean>}
 */
const { sidebarOpen } = storeToRefs(appStore)

/**
 * 切换侧边栏展开/收起状态
 * @function toggle
 * @returns {void}
 */
const toggle = () => {
  appStore.toggleSidebar()
}
</script>
```

### 带 Props 和 Emits 的组件示例

```vue
<script setup>
/**
 * @file WordPreview.vue
 * @description 词条预览组件
 */

/**
 * 组件 Props 定义
 * @property {string} wordId - 要预览的词条 ID
 */
const props = defineProps(['wordId'])

/**
 * 组件事件定义
 * @emits close - 关闭预览事件
 */
const emit = defineEmits(['close'])

/**
 * 加载词条数据
 * @async
 * @function loadWord
 * @returns {Promise<void>}
 * @description 根据 wordId 加载词条详情
 */
const loadWord = async () => {
  // 实现
}
</script>
```

---

## 最佳实践

### ✅ 应该注释的内容

1. **文件头说明**
   - 组件名称和用途
   - 使用示例
   - 依赖关系
   - 功能特性列表

2. **复杂的业务逻辑**
   - 说明 "为什么" 这样做
   - 解释算法或特殊处理

3. **非显而易见的代码**
   - 特殊的默认值
   - 边界条件处理
   - 副作用说明

4. **公共 API**
   - Props：类型、用途、默认值
   - Emits：触发时机、参数
   - 方法：功能、参数、返回值

5. **状态变量**
   - 用途说明
   - 可能的取值范围
   - 与其他状态的关系

### ❌ 不应该注释的内容

1. **显而易见的代码**
   ```javascript
   // 不好的注释
   const count = 0 // 初始化计数器为 0
   ```

2. **与代码重复的描述**
   ```javascript
   // 不好的注释
   // 设置用户名称
   userName.value = name
   ```

3. **过时的注释**
   - 修改代码时必须同步更新注释
   - 删除代码时同时删除相关注释

### 注释质量检查清单

- [ ] 文件头包含组件说明和使用示例
- [ ] 所有 Props 有类型和描述
- [ ] 所有 Emits 有触发时机说明
- [ ] 复杂函数有参数和返回值说明
- [ ] 状态变量有用途说明
- [ ] 注释与代码保持一致
- [ ] 使用中文注释（本项目规范）

---

## 常用 JSDoc 标签速查

| 标签 | 用途 | 示例 |
|-----|------|------|
| `@file` | 文件名 | `@file ComponentName.vue` |
| `@description` | 描述 | `@description 组件用途` |
| `@component` | 组件名 | `@component Header` |
| `@example` | 示例代码 | `@example <Header />` |
| `@property` | Props | `@property {string} name` |
| `@emits` | 事件 | `@emits click - 点击事件` |
| `@param` | 参数 | `@param {string} id` |
| `@returns` | 返回值 | `@returns {boolean}` |
| `@type` | 类型 | `@type {Ref<string>}` |
| `@default` | 默认值 | `@default ''` |
| `@async` | 异步 | `@async` |
| `@function` | 函数 | `@function handleClick` |
| `@computed` | 计算属性 | `@computed` |

---

## 参考资源

- [JSDoc 官方文档](https://jsdoc.app/)
- [TSDoc 官方文档](https://tsdoc.org/)
- [Vue 3 风格指南](https://vuejs.org/style-guide/)
