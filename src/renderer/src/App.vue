<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import Sidebar from './components/Layout/Sidebar.vue';
import Header from './components/Layout/Header.vue';
import ToastContainer from './components/ui/ToastContainer.vue';
import { pingAnkiConnect } from '@/services/ankiConnectService';
import { hasStoredAnkiExportOptions } from '@/services/ankiExportOptionsStore';
import { listStoredFieldMappingModelNames } from '@/services/ankiFieldMappingStore';
import {
  ONBOARDING_REPLAY_EVENT,
  isOnboardingComplete,
} from '@/components/Onboarding/onboardingState';
import { startOnboardingTour } from '@/components/Onboarding/OnboardingTour';
import { useAppStore } from '@/stores/appStore';

const appStore = useAppStore();
const router = useRouter();

const hasSavedAnkiConfiguration = (): boolean =>
  hasStoredAnkiExportOptions() || listStoredFieldMappingModelNames().length > 0;

const replayTour = (event: Event): void => {
  const targetPath =
    (event as CustomEvent<{ targetPath?: string }>).detail?.targetPath ?? '/';

  void router.push(targetPath).finally(() => {
    window.setTimeout(() => startOnboardingTour({ force: true }), 450);
  });
};

onMounted(async () => {
  const startTourIfNeeded = (): void => {
    window.setTimeout(() => startOnboardingTour(), 350);
  };

  window.addEventListener(ONBOARDING_REPLAY_EVENT, replayTour);
  if (!isOnboardingComplete()) {
    startTourIfNeeded();
  }

  if (!hasSavedAnkiConfiguration()) return;

  try {
    await pingAnkiConnect();
  } catch {
    appStore.addToast(
      'Anki connection failed. Please open Settings and reconfigure Anki.',
      'warning',
      8000
    );
  }
});

onUnmounted(() => window.removeEventListener(ONBOARDING_REPLAY_EVENT, replayTour));
</script>

<template>
  <div class="h-screen flex overflow-hidden bg-stone-50 text-slate-800">
    <Sidebar />

    <div class="flex-1 flex flex-col min-w-0 h-full relative">
      <Header />

      <div class="flex-1 relative overflow-hidden">
        <RouterView v-slot="{ Component }">
          <KeepAlive include="HomeView">
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </div>
    </div>

    <ToastContainer />
  </div>
</template>
