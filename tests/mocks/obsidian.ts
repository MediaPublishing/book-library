export const requestUrl = async (options: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  throw?: boolean;
}) => {
  throw new Error("requestUrl-Mock aufgerufen: " + options.url);
};

export const Notice = class {
  constructor(message: string) {
    // no-op in tests
  }
};

export const Platform = { isDesktopApp: true };

export const setIcon = () => {};

export class Plugin {
  app: any;
  manifest: any;
  settings: any = {};
  async loadData(): Promise<any> {
    return {};
  }
  async saveData(): Promise<void> {}
  registerView(): void {}
  addSettingTab(): void {}
  addCommand(): void {}
  loadSettings(): Promise<void> {
    return Promise.resolve();
  }
  saveSettings(): Promise<void> {
    return Promise.resolve();
  }
}

export class PluginSettingTab {
  constructor(public app: any, public plugin: any) {}
  display(): void {}
}

export class ItemView {
  constructor(public leaf: any) {}
  contentEl: any;
  getViewType(): string {
    return "";
  }
  getDisplayText(): string {
    return "";
  }
  getIcon(): string {
    return "";
  }
  async onOpen(): Promise<void> {}
}

export class WorkspaceLeaf {}
export class Modal {}
export class TFile {}
export class TFolder {}
