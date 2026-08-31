import { App, Modal, Setting, TextAreaComponent } from "obsidian";
import type BookLibrary from "./main";
import type { ManualAudiobookInput } from "./types";
import type { TranslationKey } from "./i18n";
import { validateManualAudiobookInput } from "./manual-audiobook-validation";

export class ManualAudiobookModal extends Modal {
  private plugin: BookLibrary;
  private input: ManualAudiobookInput = {
    title: "",
    author: "",
    storagePath: "",
    sourceLink: "",
    categories: [],
    synopsis: "",
  };
  private error = "";
  private saving = false;

  constructor(app: App, plugin: BookLibrary) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("book-library-manual");
    contentEl.createEl("h2", { text: this.t("manual.title") });
    new Setting(contentEl).setName(this.t("manual.titleField")).addText((text) =>
      text.setValue(this.input.title).onChange((value) => {
        this.input.title = value;
        this.error = "";
      })
    );
    new Setting(contentEl).setName(this.t("manual.author")).addText((text) =>
      text.setValue(this.input.author).onChange((value) => {
        this.input.author = value;
      })
    );
    new Setting(contentEl).setName(this.t("manual.storagePath")).addText((text) =>
      text.setPlaceholder("/Books/Audio or Provider folder").setValue(this.input.storagePath ?? "").onChange((value) => {
        this.input.storagePath = value;
        this.error = "";
      })
    );
    new Setting(contentEl).setName(this.t("manual.sourceLink")).addText((text) =>
      text.setPlaceholder("https://...").setValue(this.input.sourceLink || "").onChange((value) => {
        this.input.sourceLink = value;
        this.error = "";
      })
    );
    new Setting(contentEl).setName(this.t("manual.categories")).addText((text) =>
      text.setPlaceholder("Business, AI").setValue(this.input.categories?.join(", ") || "").onChange((value) => {
        this.input.categories = value.split(",").map((item) => item.trim()).filter(Boolean);
      })
    );
    new Setting(contentEl).setName(this.t("manual.synopsis")).addTextArea((area: TextAreaComponent) =>
      area.setValue(this.input.synopsis || "").onChange((value) => {
        this.input.synopsis = value;
      })
    );
    if (this.error) contentEl.createDiv({ text: this.error, cls: "book-library-error", attr: { role: "alert" } });
    const actions = contentEl.createDiv({ cls: "book-library-setup-actions" });
    const cancel = actions.createEl("button", { text: this.t("manual.cancel") });
    cancel.disabled = this.saving;
    cancel.addEventListener("click", () => this.close());
    const save = actions.createEl("button", { text: this.t("manual.save"), cls: "mod-cta" });
    save.disabled = this.saving;
    save.addEventListener("click", async () => {
      if (this.saving) return;
      const validationError = validateManualAudiobookInput(this.input);
      if (validationError) {
        this.error = this.t(validationError);
        this.render();
        return;
      }
      this.saving = true;
      save.setText(this.t("manual.saving"));
      try {
        await this.plugin.saveManualAudiobook(this.input);
        this.close();
      } finally {
        if (this.contentEl.childNodes.length > 0) {
          this.saving = false;
          this.render();
        }
      }
    });
  }

  private t(key: TranslationKey, params?: Record<string, string | number>): string {
    return this.plugin.t(key, params);
  }
}
