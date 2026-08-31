import { App, PluginSettingTab, Setting } from "obsidian";
import type BookLibrary from "./main";
import { DEFAULT_SETTINGS, type LibrarySettings } from "./types";
import { translate, type TranslationKey } from "./i18n";

export class BookLibrarySettingTab extends PluginSettingTab {
  plugin: BookLibrary;

  constructor(app: App, plugin: BookLibrary) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const t = this.t();
    containerEl.createEl("h2", { text: t("settings.mainSection") });

    new Setting(containerEl)
      .setName(t("settings.language"))
      .setDesc(t("settings.languageDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("auto", t("settings.languageAuto"))
          .addOption("en", t("settings.languageEnglish"))
          .addOption("de", t("settings.languageGerman"))
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value as LibrarySettings["language"];
            await this.plugin.saveSettings();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.libraryPath"))
      .setDesc(t("settings.libraryPathDesc"))
      .addText((text) =>
        text
          .setPlaceholder("/Users/.../!BookLibrary")
          .setValue(this.plugin.settings.libraryPath)
          .onChange(async (value) => {
            this.plugin.settings.libraryPath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.catalogDir"))
      .setDesc(t("settings.catalogDirDesc"))
      .addText((text) =>
        text
          .setPlaceholder("_catalog")
          .setValue(this.plugin.settings.catalogDir)
          .onChange(async (value) => {
            this.plugin.settings.catalogDir = value.trim() || DEFAULT_SETTINGS.catalogDir;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.coversDir"))
      .setDesc(t("settings.coversDirDesc"))
      .addText((text) =>
        text
          .setPlaceholder("_catalog/covers")
          .setValue(this.plugin.settings.coversDir)
          .onChange(async (value) => {
            this.plugin.settings.coversDir = value.trim() || DEFAULT_SETTINGS.coversDir;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.markdownDir"))
      .setDesc(t("settings.markdownDirDesc"))
      .addText((text) =>
        text
          .setPlaceholder("_books")
          .setValue(this.plugin.settings.markdownDir)
          .onChange(async (value) => {
            this.plugin.settings.markdownDir = value.trim() || DEFAULT_SETTINGS.markdownDir;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.wikiDir"))
      .setDesc(t("settings.wikiDirDesc"))
      .addText((text) =>
        text
          .setPlaceholder("_wiki")
          .setValue(this.plugin.settings.wikiDir)
          .onChange(async (value) => {
            this.plugin.settings.wikiDir = value.trim() || DEFAULT_SETTINGS.wikiDir;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.formats"))
      .setDesc(t("settings.formatsDesc"))
      .addText((text) =>
        text
          .setPlaceholder("epub,pdf")
          .setValue(this.plugin.settings.includeExtensions.join(","))
          .onChange(async (value) => {
            this.plugin.settings.includeExtensions = value
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.tagsFromFolders"))
      .setDesc(t("settings.tagsFromFoldersDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.tagsFromFolders).onChange(async (value) => {
          this.plugin.settings.tagsFromFolders = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t("settings.fetchMetadata"))
      .setDesc(t("settings.fetchMetadataDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.fetchMetadata).onChange(async (value) => {
          this.plugin.settings.fetchMetadata = value;
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("h3", { text: t("settings.displaySection") });

    new Setting(containerEl)
      .setName(t("settings.detailsExpanded"))
      .setDesc(t("settings.detailsExpandedDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.detailsExpanded).onChange(async (value) => {
          this.plugin.settings.detailsExpanded = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t("settings.technicalDetailsExpanded"))
      .setDesc(t("settings.technicalDetailsExpandedDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.technicalDetailsExpanded).onChange(async (value) => {
          this.plugin.settings.technicalDetailsExpanded = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t("settings.detailMode"))
      .setDesc(t("settings.detailModeDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("product", t("settings.detailModeProduct"))
          .addOption("minimal", t("settings.detailModeMinimal"))
          .setValue(this.plugin.settings.detailMode)
          .onChange(async (value) => {
            this.plugin.settings.detailMode = value as LibrarySettings["detailMode"];
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.reviewsEnabled"))
      .setDesc(t("settings.reviewsEnabledDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.reviewsEnabled).onChange(async (value) => {
          this.plugin.settings.reviewsEnabled = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t("settings.audiobookLibraryPath"))
      .setDesc(t("settings.audiobookLibraryPathDesc"))
      .addText((text) =>
        text
          .setPlaceholder("/Users/.../Audiobooks")
          .setValue(this.plugin.settings.audiobookLibraryPath)
          .onChange(async (value) => {
            this.plugin.settings.audiobookLibraryPath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: t("settings.aiSection") });

    new Setting(containerEl)
      .setName(t("settings.provider"))
      .setDesc(t("settings.providerDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("none", t("settings.providerOff"))
          .addOption("codex", "Codex-CLI")
          .addOption("opencode", "OpenCode")
          .addOption("claude", "Claude-CLI")
          .addOption("openrouter", "OpenRouter API")
          .addOption("local", t("settings.providerLocalModel"))
          .setValue(this.plugin.settings.aiProvider)
          .onChange(async (value) => {
            this.plugin.settings.aiProvider = value as LibrarySettings["aiProvider"];
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.model"))
      .setDesc(t("settings.modelDesc"))
      .addText((text) =>
        text
          .setPlaceholder("openai/gpt-4o-mini")
          .setValue(this.plugin.settings.aiModel)
          .onChange(async (value) => {
            this.plugin.settings.aiModel = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.openrouterKey"))
      .setDesc(t("settings.openrouterKeyDesc"))
      .addText((text) =>
        text
          .setPlaceholder("sk-or-...")
          .setValue(this.plugin.settings.openRouterApiKey)
          .onChange(async (value) => {
            this.plugin.settings.openRouterApiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: t("settings.aiCoverSection") });

    new Setting(containerEl)
      .setName(t("settings.aiCoverProvider"))
      .setDesc(t("settings.aiCoverProviderDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("none", t("settings.aiCoverProviderOff"))
          .addOption("openai", t("settings.aiCoverProviderOpenai"))
          .setValue(this.plugin.settings.aiCoverProvider)
          .onChange(async (value) => {
            this.plugin.settings.aiCoverProvider = value as LibrarySettings["aiCoverProvider"];
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.openaiKey"))
      .setDesc(t("settings.openaiKeyDesc"))
      .addText((text) =>
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.openAiApiKey)
          .onChange(async (value) => {
            this.plugin.settings.openAiApiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.aiCoverModel"))
      .setDesc(t("settings.aiCoverModelDesc"))
      .addText((text) =>
        text
          .setPlaceholder("gpt-image-2")
          .setValue(this.plugin.settings.aiCoverModel)
          .onChange(async (value) => {
            this.plugin.settings.aiCoverModel = value.trim() || "gpt-image-2";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.aiCoverSize"))
      .setDesc(t("settings.aiCoverSizeDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("1024x1024", "1024x1024")
          .addOption("1536x1536", "1536x1536")
          .setValue(this.plugin.settings.aiCoverSize)
          .onChange(async (value) => {
            this.plugin.settings.aiCoverSize = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.aiCoverBatch"))
      .setDesc(t("settings.aiCoverBatchDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("16", "4x4 (16)")
          .setValue(String(this.plugin.settings.aiCoverBatchSize))
          .onChange(async (value) => {
            this.plugin.settings.aiCoverBatchSize = Number(value) || 16;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.budget"))
      .setDesc(t("settings.budgetDesc"))
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.budgetCents))
          .onChange(async (value) => {
            this.plugin.settings.budgetCents = Math.max(1, Number(value) || 100);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.maxBooks"))
      .setDesc(t("settings.maxBooksDesc"))
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.maxBooksPerRun))
          .onChange(async (value) => {
            this.plugin.settings.maxBooksPerRun = Math.max(1, Number(value) || 10);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.maxTokens"))
      .setDesc(t("settings.maxTokensDesc"))
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.maxTokensPerBook))
          .onChange(async (value) => {
            this.plugin.settings.maxTokensPerBook = Math.max(1000, Number(value) || 12000);
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: t("settings.proSection") });

    new Setting(containerEl)
      .setName(t("settings.proKey"))
      .setDesc(t("settings.proKeyDesc"))
      .addText((text) =>
        text
          .setValue(this.plugin.settings.proLicenseKey)
          .onChange(async (value) => {
            this.plugin.settings.proLicenseKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.paymentLink"))
      .setDesc(t("settings.paymentLinkDesc"))
      .addText((text) =>
        text
          .setValue(this.plugin.settings.stripePaymentLink)
          .onChange(async (value) => {
            this.plugin.settings.stripePaymentLink = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.checkoutEndpoint"))
      .setDesc(t("settings.checkoutEndpointDesc"))
      .addText((text) =>
        text
          .setValue(this.plugin.settings.checkoutEndpoint)
          .onChange(async (value) => {
            this.plugin.settings.checkoutEndpoint = value.trim();
            await this.plugin.saveSettings();
          })
      );
  }

  private t(): (key: TranslationKey, params?: Record<string, string | number>) => string {
    return (key, params) => translate(this.plugin.language, key, params);
  }
}
