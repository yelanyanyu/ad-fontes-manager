<script setup>
import { onMounted, ref } from 'vue'

defineOptions({
  name: 'HomeView'
})

import WordEditor from '@/components/WordEditor/WordEditor.vue'
import WordList from '@/components/WordList/WordList.vue'
import WordPreview from '@/components/WordPreview/WordPreview.vue'

const leftPanel = ref(null)
const dragHandle = ref(null)
const container = ref(null)
const previewId = ref(null)

const showPreview = (id) => {
    previewId.value = id
}

const closePreview = () => {
    previewId.value = null
}

onMounted(() => {
    const handle = dragHandle.value
    const left = leftPanel.value
    const parent = container.value

    if (!handle || !left || !parent) return

    let isResizing = false
    let startX = 0
    let startWidth = 0

    handle.addEventListener('mousedown', (e) => {
        isResizing = true
        startX = e.clientX
        startWidth = left.getBoundingClientRect().width
        handle.classList.add('active')
        document.body.style.cursor = 'col-resize'
        e.preventDefault()
    })

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return
        const dx = e.clientX - startX
        const newWidth = startWidth + dx
        
        // Constraints
        if (newWidth < 300) return
        if (newWidth > parent.clientWidth - 350) return

        left.style.width = `${newWidth}px`
    })

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false
            handle.classList.remove('active')
            document.body.style.cursor = ''
        }
    })
})
</script>

<template>
    <main ref="container" class="absolute inset-0 flex flex-row p-4 gap-0 h-full">
        <!-- Left: Editor -->
        <div ref="leftPanel" class="flex flex-col h-full min-w-[300px]" style="width: 45%;">
            <WordEditor />
        </div>

        <!-- Resizer -->
        <div ref="dragHandle" class="resizer z-20"></div>

        <!-- Right: List -->
        <div class="flex-1 flex flex-col h-full min-w-[350px] min-h-0">
            <WordList @preview="showPreview" />
        </div>

        <!-- Preview Overlay -->
        <WordPreview v-if="previewId" :word-id="previewId" @close="closePreview" />
    </main>
</template>
