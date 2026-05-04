<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const navItems = [
  {
    to: '/',
    title: 'Words',
    match: (path: string) => path === '/' || path === '/words' || path.startsWith('/?'),
    icon: 'book',
  },
  {
    to: '/editor',
    title: 'Generate',
    match: (path: string) => path === '/editor',
    icon: 'sparkles',
  },
];

function isActive(item: (typeof navItems)[0]): boolean {
  return item.match(route.path);
}
</script>

<template>
  <aside class="sidebar" aria-label="Main navigation">
    <RouterLink
      v-for="item in navItems"
      :key="item.to"
      :to="item.to"
      :title="item.title"
      :data-tour="item.to === '/editor' ? 'generate-entry' : undefined"
      :class="['nav-item', { active: isActive(item) }]"
    >
      <!-- Book icon (Words) -->
      <svg
        v-if="item.icon === 'book'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
      >
        <path d="M6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3z" />
        <path d="M8 7h8" />
        <path d="M8 11h8" />
      </svg>
      <!-- Sparkles icon (Generate) -->
      <svg
        v-else-if="item.icon === 'sparkles'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
      >
        <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09z" />
      </svg>
    </RouterLink>

    <div class="spacer" />

    <RouterLink
      to="/settings"
      title="Settings"
      :class="['nav-item', { active: route.path === '/settings' }]"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z"
        />
        <path
          d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 3.6 15 1.7 1.7 0 0 0 3 14a1.7 1.7 0 0 0-1.1-.4H1.8a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 3.6 8 1.7 1.7 0 0 0 3.26 6.1l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8 3.6 1.7 1.7 0 0 0 9 3a1.7 1.7 0 0 0 .4-1.1V1.8a2 2 0 0 1 4 0v.09A1.7 1.7 0 0 0 15 3.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 8c.2.38.6.7 1 .8.3.1.7.1 1.1.1h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.1.4c-.4.2-.7.6-1 .7z"
        />
      </svg>
    </RouterLink>
  </aside>
</template>

<style scoped>
.sidebar {
  background: linear-gradient(180deg, #171410 0%, #11100d 100%);
  border-right: 1px solid rgba(255, 255, 255, 0.055);
  padding: 14px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

[data-theme="dark"] .sidebar {
  background: linear-gradient(180deg, #0d0c0b 0%, #090807 100%);
}

.nav-item {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #aaa39a;
  display: grid;
  place-items: center;
  transition: background 0.14s ease, color 0.14s ease;
  text-decoration: none;
}

[data-theme="dark"] .nav-item {
  color: #8d857b;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.075);
  color: #fff;
}

[data-theme="dark"] .nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f2eadf;
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.085);
  color: #fff;
}

[data-theme="dark"] .nav-item.active {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.nav-item svg {
  width: 18px;
  height: 18px;
  stroke-width: 1.85;
}

.spacer {
  flex: 1;
}
</style>
