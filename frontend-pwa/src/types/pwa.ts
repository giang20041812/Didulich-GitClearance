export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export type PlatformType = 'ios' | 'android' | 'desktop-chrome' | 'desktop-other';

export interface PwaInstallState {
  canInstall: boolean;
  isInstalled: boolean;
  isIos: boolean;
  isMobile: boolean;
  platform: PlatformType;
  installApp: () => Promise<boolean>;
}
