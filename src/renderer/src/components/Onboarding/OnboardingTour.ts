import { driver, type DriveStep } from 'driver.js';

import { isOnboardingComplete, markOnboardingComplete } from './onboardingState';

export const ONBOARDING_STEPS: DriveStep[] = [
  {
    element: '[data-tour="word-editor"]',
    popover: {
      title: '编辑 YAML',
      description: '在这里输入或编辑单词的 YAML 内容。支持实时语法校验和模式验证。',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="word-list"]',
    popover: {
      title: '浏览词库',
      description: '这里是你的词库。可以搜索、排序、分页浏览，选中单词后导出到 Anki。',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="language-switcher"]',
    popover: {
      title: '切换语言',
      description: '切换目标语言（英语/德语），影响 YAML 的生成模板和校验规则。',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="generate-entry"]',
    popover: {
      title: '批量生成',
      description: '批量生成：输入多个单词和上下文，由 AI 自动生成完整的词源 YAML。',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="announcement-bell"]',
    popover: {
      title: '查看公告',
      description: '更新公告和新功能通知会出现在这里。点击查看详情。',
      side: 'bottom',
      align: 'end',
    },
  },
];

function getAvailableSteps(): DriveStep[] {
  return ONBOARDING_STEPS.filter(step => {
    if (typeof step.element !== 'string') return true;
    return Boolean(document.querySelector(step.element));
  });
}

export function startOnboardingTour(options: { force?: boolean } = {}): void {
  if (!options.force && isOnboardingComplete()) return;

  const steps = getAvailableSteps();
  if (!steps.length) return;

  driver({
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
  }).drive();
}
