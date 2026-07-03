<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from 'codemirror';
import { basicSetup } from 'codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { indentWithTab } from '@codemirror/commands';
import { keymap } from '@codemirror/view';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import type { FormatDiagnosticMessage } from '@/modules/wordEditor/validationController';
import {
  formatDiagnosticsToCodeMirror,
  resolveDiagnosticLine,
} from '@/modules/wordEditor/codeMirrorDiagnostics';

const props = defineProps<{
  modelValue: string;
  diagnostics?: FormatDiagnosticMessage[];
  readonly?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'cursor-change': [position: number];
}>();

const hostRef = ref<HTMLElement | null>(null);
const view = shallowRef<EditorView | null>(null);
const editableCompartment = new Compartment();
let applyingExternalValue = false;

const editableTheme = EditorView.theme({
  '&': {
    height: '100%',
    minHeight: '0',
    color: 'var(--text)',
    backgroundColor: 'var(--editor-field)',
    fontSize: '13px',
  },
  '.cm-scroller': {
    fontFamily: 'var(--mono)',
    lineHeight: '1.65',
  },
  '.cm-content': {
    padding: '16px 0',
  },
  '.cm-line': {
    padding: '0 16px',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--surface-panel)',
    color: 'var(--faint)',
    borderRight: '1px solid var(--line)',
  },
  '.cm-activeLineGutter, .cm-activeLine': {
    backgroundColor: 'rgba(36, 114, 83, 0.07)',
  },
  '.cm-yaml-error-underline': {
    textDecorationLine: 'underline',
    textDecorationStyle: 'wavy',
    textDecorationColor: 'var(--red)',
    textDecorationThickness: '1.5px',
    textUnderlineOffset: '3px',
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
  },
  '.cm-yaml-schema-underline': {
    textDecorationLine: 'underline',
    textDecorationStyle: 'wavy',
    textDecorationColor: 'var(--amber)',
    textDecorationThickness: '1.5px',
    textUnderlineOffset: '3px',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  '.cm-diagnostic.cm-diagnostic-error': {
    borderLeftColor: 'var(--red)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
});

function createExtensions(): Extension[] {
  return [
    basicSetup,
    yaml(),
    keymap.of([indentWithTab]),
    lintGutter(),
    EditorView.lineWrapping,
    editableTheme,
    editableCompartment.of([
      EditorView.editable.of(!props.readonly),
      EditorState.readOnly.of(Boolean(props.readonly)),
    ]),
    EditorView.updateListener.of(update => {
      if (update.selectionSet || update.docChanged) {
        emit('cursor-change', update.state.selection.main.head);
      }
      if (update.docChanged && !applyingExternalValue) {
        emit('update:modelValue', update.state.doc.toString());
      }
    }),
  ];
}

function applyDiagnostics(): void {
  const editor = view.value;
  if (!editor) return;
  editor.dispatch(
    setDiagnostics(
      editor.state,
      formatDiagnosticsToCodeMirror(props.modelValue, props.diagnostics || [])
    )
  );
}

function replaceDocument(nextValue: string): void {
  const editor = view.value;
  if (!editor || editor.state.doc.toString() === nextValue) return;

  applyingExternalValue = true;
  editor.dispatch({
    changes: {
      from: 0,
      to: editor.state.doc.length,
      insert: nextValue,
    },
  });
  applyingExternalValue = false;
  applyDiagnostics();
}

onMounted(() => {
  if (!hostRef.value) return;

  view.value = new EditorView({
    parent: hostRef.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: createExtensions(),
    }),
  });
  applyDiagnostics();
});

watch(
  () => props.modelValue,
  nextValue => replaceDocument(nextValue)
);

watch(
  () => props.diagnostics,
  () => applyDiagnostics(),
  { deep: true }
);

watch(
  () => props.readonly,
  readonly => {
    const editor = view.value;
    if (!editor) return;
    editor.dispatch({
      effects: editableCompartment.reconfigure([
        EditorView.editable.of(!readonly),
        EditorState.readOnly.of(Boolean(readonly)),
      ]),
    });
  }
);

onBeforeUnmount(() => {
  view.value?.destroy();
  view.value = null;
});

function focus(): void {
  view.value?.focus();
}

function goToLine(lineNumber: number): void {
  const editor = view.value;
  if (!editor) return;
  const line = editor.state.doc.line(Math.max(1, Math.min(lineNumber, editor.state.doc.lines)));
  editor.dispatch({
    selection: { anchor: line.from },
    effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
  });
  editor.focus();
}

function goToDiagnostic(diagnostic: FormatDiagnosticMessage): boolean {
  const line = resolveDiagnosticLine(props.modelValue, diagnostic);
  if (!line) return false;
  goToLine(line);
  return true;
}

defineExpose({
  focus,
  goToLine,
  goToDiagnostic,
});
</script>

<template>
  <div
    ref="hostRef"
    class="codemirror-yaml-editor"
    data-testid="codemirror-yaml-editor"
    aria-label="CodeMirror YAML editor"
  />
</template>

<style scoped>
.codemirror-yaml-editor {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  background: var(--editor-field);
}

:deep(.cm-editor) {
  height: 100%;
}
</style>
