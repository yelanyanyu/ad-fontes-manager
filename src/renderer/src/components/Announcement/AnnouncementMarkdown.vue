<script setup lang="ts">
import { marked } from 'marked';
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{
  bodyMd: string;
}>();

const containerRef = ref<HTMLElement | null>(null);

function sanitizeHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('script, style, iframe, object, embed').forEach(element => {
    element.remove();
  });
  document.body.querySelectorAll('*').forEach(element => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (
        name.startsWith('on') ||
        (['href', 'src'].includes(name) && value.startsWith('javascript:'))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  return document.body.innerHTML;
}

function renderMarkdown(body: string): string {
  const html = marked.parse(body || '', { async: false }) as string;
  return sanitizeHtml(html);
}

watch(
  () => props.bodyMd,
  async body => {
    await nextTick();
    if (containerRef.value) {
      containerRef.value.innerHTML = renderMarkdown(body);
    }
  },
  { immediate: true }
);
</script>

<template>
  <div ref="containerRef" class="markdown-body announcement-markdown text-sm" />
</template>

<style scoped>
.announcement-markdown {
  background: transparent;
}

.announcement-markdown :deep(h1),
.announcement-markdown :deep(h2),
.announcement-markdown :deep(h3) {
  margin-top: 0.5rem;
}
</style>
