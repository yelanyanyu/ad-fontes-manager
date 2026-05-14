import { driver, type DriveStep, type Driver } from 'driver.js';

import {
  ONBOARDING_NAVIGATE_EVENT,
  isOnboardingComplete,
  markOnboardingComplete,
} from './onboardingState';

const ALWAYS_AVAILABLE_SELECTORS = new Set([
  '[data-tour="settings-entry"]',
  '[data-tour="settings-api-tab"]',
  '[data-tour="settings-deepseek-provider"]',
  '[data-tour="settings-provider-website"]',
  '[data-tour="settings-provider-api-key"]',
  '[data-tour="settings-provider-test"]',
  '[data-tour="settings-search-api-nav"]',
  '[data-tour="ai-generate-entry"]',
  '[data-tour="ai-generate-mode"]',
  '[data-tour="ai-generate-submit"]',
  '[data-tour="word-editor"]',
  '[data-tour="ai-generate-queue"]',
]);

function navigateTo(targetPath: string): void {
  window.dispatchEvent(new CustomEvent(ONBOARDING_NAVIGATE_EVENT, { detail: { targetPath } }));
}

function clickTourTarget(selector: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  element?.click();
}

function moveNextAfter(driverInstance: Driver, delayMs = 180): void {
  window.setTimeout(() => driverInstance.moveNext(), delayMs);
}

export const ONBOARDING_STEPS: DriveStep[] = [
  {
    element: '[data-tour="settings-entry"]',
    popover: {
      title: '打开设置',
      description: '先进入设置，配置必要的 API 信息，然后再开始解析单词。',
      side: 'right',
      align: 'end',
      onNextClick: (_element, _step, { driver }) => {
        navigateTo('/settings');
        moveNextAfter(driver, 450);
      },
    },
  },
  {
    element: '[data-tour="settings-api-tab"]',
    popover: {
      title: '进入 API 设置',
      description: '点击 API，配置 LLM 服务商、模型和密钥。',
      side: 'right',
      align: 'center',
      onNextClick: (_element, _step, { driver }) => {
        clickTourTarget('[data-tour="settings-api-tab"]');
        moveNextAfter(driver, 220);
      },
    },
  },
  {
    element: '[data-tour="settings-deepseek-provider"]',
    popover: {
      title: '选择 DeepSeek',
      description: '推荐使用 DeepSeek 官方 API，实测性价比最高。',
      side: 'right',
      align: 'center',
      onNextClick: (_element, _step, { driver }) => {
        clickTourTarget('[data-tour="settings-deepseek-provider"]');
        moveNextAfter(driver, 220);
      },
    },
  },
  {
    element: '[data-tour="settings-provider-website"]',
    popover: {
      title: '创建 API Key',
      description: '点击这里前往官网，新建可用于本应用的 API Key。',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="settings-provider-api-key"]',
    popover: {
      title: '填写 API Key',
      description: '把官网创建的 API Key 填到这里，应用会自动保存配置。',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="settings-provider-test"]',
    popover: {
      title: '检测连接',
      description: '点击检测，确认当前服务商、密钥和模型可以正常调用。',
      side: 'left',
      align: 'center',
    },
  },
  {
    element: '[data-tour="settings-search-api-nav"]',
    popover: {
      title: '配置搜索 API',
      description: '这里配置搜索 API Key，用于生成前的联网检索。',
      side: 'right',
      align: 'center',
      onNextClick: (_element, _step, { driver }) => {
        clickTourTarget('[data-tour="settings-search-api-nav"]');
        navigateTo('/');
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('ad-fontes:ai-generate-open'));
          driver.moveNext();
        }, 500);
      },
    },
  },
  {
    element: '[data-tour="ai-generate-entry"]',
    popover: {
      title: 'AI 生成',
      description: '点击这里开始解析单词，打开 AI 生成面板。',
      side: 'bottom',
      align: 'end',
      onNextClick: (_element, _step, { driver }) => {
        window.dispatchEvent(new CustomEvent('ad-fontes:ai-generate-open'));
        moveNextAfter(driver, 220);
      },
    },
  },
  {
    element: '[data-tour="ai-generate-mode"]',
    popover: {
      title: '选择生成模式',
      description: '单词模式用于一个一个生成；批量模式用于一次提交多个单词。',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="ai-generate-submit"]',
    popover: {
      title: '开始生成',
      description: '填写单词和上下文后，点击生成按钮开始生成词源 YAML。',
      side: 'left',
      align: 'center',
    },
  },
  {
    element: '[data-tour="ai-generate-progress"]',
    popover: {
      title: '查看生成进度',
      description:
        '这里展示搜索、生成、审核、修复各阶段的状态。生成后可以查看详情，或从指定阶段重新生成。',
      side: 'left',
      align: 'center',
    },
  },
  {
    element: '[data-tour="ai-generate-score"]',
    popover: {
      title: '质量评分',
      description: '这里显示单词解析质量评分。分数低时，可以继续改善文本质量。',
      side: 'left',
      align: 'end',
    },
  },
  {
    element: '[data-tour="ai-generate-improve"]',
    popover: {
      title: '改善文本质量',
      description: '这个按钮会根据审核意见或你的补充反馈，改善单词解析质量。',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="ai-generate-save"]',
    popover: {
      title: '保存到数据库',
      description:
        '保存前会先修复常见 YAML 包裹和格式问题，再写入数据库。遇到冲突时会要求确认覆盖。',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="ai-generate-fill-editor"]',
    popover: {
      title: '放入 YAML 编辑器',
      description: '如果想手动修改，或保存失败，可以把生成结果放入 YAML 编辑器继续精修。',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="word-editor"]',
    popover: {
      title: 'YAML 编辑器',
      description: '这里可以手动修改并保存生成的单词，也可以更精细地处理冲突。',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="ai-generate-queue"]',
    popover: {
      title: '生成队列',
      description: '这里会显示正在生成、排队、暂停、失败和已完成的任务。',
      side: 'top',
      align: 'start',
    },
  },
];

function getAvailableSteps(): DriveStep[] {
  return ONBOARDING_STEPS.filter(step => {
    if (typeof step.element !== 'string') return true;
    return (
      ALWAYS_AVAILABLE_SELECTORS.has(step.element) || Boolean(document.querySelector(step.element))
    );
  });
}

export function startOnboardingTour(options: { force?: boolean } = {}): void {
  if (!options.force && isOnboardingComplete()) return;

  window.setTimeout(() => {
    const steps = getAvailableSteps();
    if (!steps.length) return;

    const tour = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayColor: 'rgba(15, 23, 42, 0.62)',
      nextBtnText: '下一步',
      prevBtnText: '上一步',
      doneBtnText: '完成',
      popoverClass: 'ad-fontes-driver-popover',
      steps,
      onDestroyed: markOnboardingComplete,
      onHighlightStarted: (_element, step) => {
        const selector = typeof step?.element === 'string' ? step.element : '';

        // Settings steps live on another route, so prepare that page before Driver resolves
        // the following highlights.
        if (selector === '[data-tour="settings-api-tab"]') {
          navigateTo('/settings');
        }
        if (selector === '[data-tour="settings-deepseek-provider"]') {
          clickTourTarget('[data-tour="settings-api-tab"]');
          clickTourTarget('[data-tour="settings-api-providers-nav"]');
        }
        if (selector === '[data-tour="settings-provider-website"]') {
          clickTourTarget('[data-tour="settings-deepseek-provider"]');
        }
        if (selector === '[data-tour="ai-generate-entry"]') {
          navigateTo('/');
        }
        if (selector === '[data-tour="ai-generate-mode"]') {
          window.dispatchEvent(new CustomEvent('ad-fontes:ai-generate-open'));
        }
      },
    });

    tour.drive();
  }, 120);
}
