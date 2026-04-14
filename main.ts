import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  normalizePath,
} from "obsidian";

type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
const WEEKDAY_ORDER: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_FULL: Record<Weekday, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
  Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

interface FrontmatterEntry {
  key: string;
  value: string;
}

interface WeekNotesSettings {
  weekFolderTemplate: string;
  dailyFilenameTemplate: string;
  weeklyFilenameTemplate: string;
  enabledWeekdays: Record<Weekday, boolean>;
  weekStart: "monday" | "sunday";
  weekNumbering: "iso" | "us";
  dailyTemplatePath: string;
  weeklyTemplatePath: string;
  dailyFrontmatter: FrontmatterEntry[];
  weeklyFrontmatter: FrontmatterEntry[];
  autoGenerate: "off" | "startup";
  openTodayOnLaunch: boolean;
  embedStyle: "embed" | "link";
}

const DEFAULT_SETTINGS: WeekNotesSettings = {
  weekFolderTemplate: "1-note/Week {week}",
  dailyFilenameTemplate: "{date} - {weekday}",
  weeklyFilenameTemplate: "_Week {week}",
  enabledWeekdays: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: false, Sun: false },
  weekStart: "monday",
  weekNumbering: "iso",
  dailyTemplatePath: "",
  weeklyTemplatePath: "",
  dailyFrontmatter: [
    { key: "type", value: "daily note" },
    { key: "date", value: "{isoDate}" },
    { key: "week", value: "\"{week}\"" },
    { key: "weekday", value: "{weekday}" },
  ],
  weeklyFrontmatter: [
    { key: "type", value: "weekly note" },
    { key: "week", value: "\"{week}\"" },
    { key: "year", value: "\"{year}\"" },
  ],
  autoGenerate: "off",
  openTodayOnLaunch: false,
  embedStyle: "embed",
};

interface DateTokens {
  date: string;      // YYYYMMDD
  isoDate: string;   // YYYY-MM-DD
  weekday: string;   // Monday
  weekdayShort: Weekday;
  week: string;      // 1..53 (no leading zero)
  weekPadded: string; // 01..53
  year: string;
  month: string;
  day: string;
}

export default class WeekNotesPlugin extends Plugin {
  settings!: WeekNotesSettings;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new WeekNotesSettingTab(this.app, this));

    this.addCommand({
      id: "generate-current-week",
      name: "Generate current week's notes",
      callback: () => this.generateWeek(new Date()),
    });

    this.addCommand({
      id: "generate-next-week",
      name: "Generate next week's notes",
      callback: () => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        this.generateWeek(d);
      },
    });

    this.addCommand({
      id: "generate-week-for-date",
      name: "Generate notes for week containing date…",
      callback: () => new DatePickerModal(this.app, (date) => this.generateWeek(date)).open(),
    });

    this.addCommand({
      id: "open-today",
      name: "Open today's note",
      callback: () => this.openToday(),
    });

    this.addRibbonIcon("calendar-plus", "Generate current week's notes", () => {
      this.generateWeek(new Date());
    });

    this.app.workspace.onLayoutReady(async () => {
      if (this.settings.autoGenerate === "startup") {
        await this.generateWeek(new Date(), { silent: true });
      }
      if (this.settings.openTodayOnLaunch) {
        await this.openToday(true);
      }
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    // Backfill weekday object if missing keys
    this.settings.enabledWeekdays = Object.assign(
      {} as Record<Weekday, boolean>,
      DEFAULT_SETTINGS.enabledWeekdays,
      this.settings.enabledWeekdays || {}
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // ---------- date helpers ----------

  computeWeek(d: Date): { week: number; year: number } {
    if (this.settings.weekNumbering === "iso") {
      const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = target.getUTCDay() || 7;
      target.setUTCDate(target.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      return { week, year: target.getUTCFullYear() };
    } else {
      // US: week 1 is the week containing Jan 1, week starts Sunday
      const start = new Date(d.getFullYear(), 0, 1);
      const day = start.getDay();
      const diff = (d.getTime() - start.getTime()) / 86400000;
      const week = Math.floor((diff + day) / 7) + 1;
      return { week, year: d.getFullYear() };
    }
  }

  startOfWeek(d: Date): Date {
    const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = out.getDay(); // 0 = Sun
    const offset = this.settings.weekStart === "monday"
      ? (day === 0 ? -6 : 1 - day)
      : -day;
    out.setDate(out.getDate() + offset);
    return out;
  }

  weekdayShortFor(d: Date): Weekday {
    return WEEKDAY_ORDER[(d.getDay() + 6) % 7]; // shift so Mon=0
  }

  buildTokens(d: Date): DateTokens {
    const yyyy = d.getFullYear().toString().padStart(4, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    const dd = d.getDate().toString().padStart(2, "0");
    const { week, year } = this.computeWeek(d);
    const wShort = this.weekdayShortFor(d);
    return {
      date: `${yyyy}${mm}${dd}`,
      isoDate: `${yyyy}-${mm}-${dd}`,
      weekday: WEEKDAY_FULL[wShort],
      weekdayShort: wShort,
      week: String(week),
      weekPadded: String(week).padStart(2, "0"),
      year: String(year),
      month: mm,
      day: dd,
    };
  }

  applyTokens(tmpl: string, tokens: DateTokens): string {
    return tmpl
      .replace(/\{date\}/g, tokens.date)
      .replace(/\{isoDate\}/g, tokens.isoDate)
      .replace(/\{weekday\}/g, tokens.weekday)
      .replace(/\{weekdayShort\}/g, tokens.weekdayShort)
      .replace(/\{week\}/g, tokens.week)
      .replace(/\{weekPadded\}/g, tokens.weekPadded)
      .replace(/\{year\}/g, tokens.year)
      .replace(/\{month\}/g, tokens.month)
      .replace(/\{day\}/g, tokens.day);
  }

  // ---------- core ----------

  async generateWeek(refDate: Date, opts: { silent?: boolean } = {}) {
    const start = this.startOfWeek(refDate);
    const weekTokens = this.buildTokens(start);
    const folderPath = normalizePath(this.applyTokens(this.settings.weekFolderTemplate, weekTokens));
    await this.ensureFolder(folderPath);

    const enabledDays: { date: Date; tokens: DateTokens; filename: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const wShort = this.weekdayShortFor(d);
      if (!this.settings.enabledWeekdays[wShort]) continue;
      const tokens = this.buildTokens(d);
      const filename = this.applyTokens(this.settings.dailyFilenameTemplate, tokens);
      enabledDays.push({ date: d, tokens, filename });
    }

    let createdDaily = 0;
    let skippedDaily = 0;
    for (const day of enabledDays) {
      const path = normalizePath(`${folderPath}/${day.filename}.md`);
      const created = await this.createNoteIfMissing(
        path,
        day.tokens,
        this.settings.dailyTemplatePath,
        this.settings.dailyFrontmatter,
      );
      created ? createdDaily++ : skippedDaily++;
    }

    // Weekly note
    const weeklyName = this.applyTokens(this.settings.weeklyFilenameTemplate, weekTokens);
    const weeklyPath = normalizePath(`${folderPath}/${weeklyName}.md`);
    const weeklyBody = this.buildWeeklyBody(folderPath, enabledDays);
    const weeklyCreated = await this.createNoteIfMissing(
      weeklyPath,
      weekTokens,
      this.settings.weeklyTemplatePath,
      this.settings.weeklyFrontmatter,
      weeklyBody,
    );

    if (!opts.silent) {
      new Notice(
        `Week ${weekTokens.week}: ${createdDaily} daily created, ${skippedDaily} existed; weekly ${weeklyCreated ? "created" : "existed"}.`
      );
    }
  }

  buildWeeklyBody(folderPath: string, days: { tokens: DateTokens; filename: string }[]): string {
    const lines: string[] = [];
    for (const day of days) {
      lines.push(`## ${day.tokens.isoDate} - ${day.tokens.weekday}`);
      const link = day.filename;
      if (this.settings.embedStyle === "embed") {
        lines.push(`![[${link}]]`);
      } else {
        lines.push(`[[${link}]]`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  async ensureFolder(path: string) {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFolder) return;
    if (existing) throw new Error(`Path exists but is not a folder: ${path}`);
    // Create recursively
    const parts = path.split("/").filter(Boolean);
    let cur = "";
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      const node = this.app.vault.getAbstractFileByPath(cur);
      if (!node) {
        await this.app.vault.createFolder(cur);
      }
    }
  }

  async createNoteIfMissing(
    path: string,
    tokens: DateTokens,
    templatePath: string,
    frontmatter: FrontmatterEntry[],
    appendBody?: string,
  ): Promise<boolean> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing) return false;

    let body = "";
    if (templatePath) {
      const tpl = this.app.vault.getAbstractFileByPath(normalizePath(templatePath));
      if (tpl instanceof TFile) {
        const raw = await this.app.vault.read(tpl);
        body = this.applyTokens(raw, tokens);
      } else {
        new Notice(`Template not found: ${templatePath}`);
      }
    }

    const fm = this.renderFrontmatter(frontmatter, tokens);
    const sections = [fm, body, appendBody ?? ""].filter((s) => s && s.length > 0);
    const content = sections.join("\n\n").replace(/\n{3,}/g, "\n\n");

    await this.app.vault.create(path, content.endsWith("\n") ? content : content + "\n");
    return true;
  }

  renderFrontmatter(entries: FrontmatterEntry[], tokens: DateTokens): string {
    const valid = entries.filter((e) => e.key.trim().length > 0);
    if (valid.length === 0) return "";
    const lines = ["---"];
    for (const e of valid) {
      const v = this.applyTokens(e.value, tokens);
      lines.push(`${e.key}: ${v}`);
    }
    lines.push("---");
    return lines.join("\n");
  }

  async openToday(silent = false) {
    const today = new Date();
    const wShort = this.weekdayShortFor(today);
    if (!this.settings.enabledWeekdays[wShort]) {
      if (!silent) new Notice(`Today (${WEEKDAY_FULL[wShort]}) is not an enabled weekday.`);
      return;
    }
    const start = this.startOfWeek(today);
    const weekTokens = this.buildTokens(start);
    const folderPath = normalizePath(this.applyTokens(this.settings.weekFolderTemplate, weekTokens));
    const tokens = this.buildTokens(today);
    const filename = this.applyTokens(this.settings.dailyFilenameTemplate, tokens);
    const path = normalizePath(`${folderPath}/${filename}.md`);
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      await this.generateWeek(today, { silent: true });
      file = this.app.vault.getAbstractFileByPath(path);
    }
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
    } else if (!silent) {
      new Notice(`Could not find or create today's note at ${path}`);
    }
  }
}

class DatePickerModal extends Modal {
  onPick: (d: Date) => void;
  constructor(app: App, onPick: (d: Date) => void) {
    super(app);
    this.onPick = onPick;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Generate week containing date" });
    const input = contentEl.createEl("input", { type: "date" });
    const today = new Date();
    input.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const btn = contentEl.createEl("button", { text: "Generate" });
    btn.style.marginLeft = "8px";
    btn.onclick = () => {
      if (!input.value) return;
      const [y, m, d] = input.value.split("-").map(Number);
      this.onPick(new Date(y, m - 1, d));
      this.close();
    };
  }
  onClose() {
    this.contentEl.empty();
  }
}

class WeekNotesSettingTab extends PluginSettingTab {
  plugin: WeekNotesPlugin;
  constructor(app: App, plugin: WeekNotesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Week Notes" });
    const tokensHelp = containerEl.createEl("p");
    tokensHelp.setText(
      "Tokens: {date} {isoDate} {weekday} {weekdayShort} {week} {weekPadded} {year} {month} {day}"
    );
    tokensHelp.style.opacity = "0.7";

    new Setting(containerEl)
      .setName("Week folder")
      .setDesc("Template for the week's folder path (relative to vault root).")
      .addText((t) =>
        t.setValue(this.plugin.settings.weekFolderTemplate).onChange(async (v) => {
          this.plugin.settings.weekFolderTemplate = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Daily note filename")
      .setDesc("Template for daily note filename (without .md).")
      .addText((t) =>
        t.setValue(this.plugin.settings.dailyFilenameTemplate).onChange(async (v) => {
          this.plugin.settings.dailyFilenameTemplate = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Weekly note filename")
      .setDesc("Template for weekly roundup filename (without .md).")
      .addText((t) =>
        t.setValue(this.plugin.settings.weeklyFilenameTemplate).onChange(async (v) => {
          this.plugin.settings.weeklyFilenameTemplate = v;
          await this.plugin.saveSettings();
        })
      );

    const daysSetting = new Setting(containerEl)
      .setName("Days to generate")
      .setDesc("Which weekdays get a daily note.");
    for (const wd of WEEKDAY_ORDER) {
      daysSetting.addToggle((tg) =>
        tg
          .setTooltip(WEEKDAY_FULL[wd])
          .setValue(this.plugin.settings.enabledWeekdays[wd])
          .onChange(async (v) => {
            this.plugin.settings.enabledWeekdays[wd] = v;
            await this.plugin.saveSettings();
          })
      );
    }
    const dayLabels = daysSetting.controlEl.createDiv();
    dayLabels.style.marginLeft = "8px";
    dayLabels.style.fontSize = "12px";
    dayLabels.style.opacity = "0.7";
    dayLabels.setText(WEEKDAY_ORDER.join(" "));

    new Setting(containerEl)
      .setName("Week starts on")
      .addDropdown((d) =>
        d
          .addOption("monday", "Monday")
          .addOption("sunday", "Sunday")
          .setValue(this.plugin.settings.weekStart)
          .onChange(async (v) => {
            this.plugin.settings.weekStart = v as "monday" | "sunday";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Week numbering")
      .addDropdown((d) =>
        d
          .addOption("iso", "ISO 8601")
          .addOption("us", "US (Jan 1 = Week 1)")
          .setValue(this.plugin.settings.weekNumbering)
          .onChange(async (v) => {
            this.plugin.settings.weekNumbering = v as "iso" | "us";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Daily template path")
      .setDesc("Optional. Path to a template file in the vault. Tokens are substituted.")
      .addText((t) =>
        t.setPlaceholder("templates/daily.md")
          .setValue(this.plugin.settings.dailyTemplatePath)
          .onChange(async (v) => {
            this.plugin.settings.dailyTemplatePath = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Weekly template path")
      .setDesc("Optional. Roundup links are appended after template content.")
      .addText((t) =>
        t.setPlaceholder("templates/weekly.md")
          .setValue(this.plugin.settings.weeklyTemplatePath)
          .onChange(async (v) => {
            this.plugin.settings.weeklyTemplatePath = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Roundup link style")
      .setDesc("Embed renders inline; link is just a wikilink.")
      .addDropdown((d) =>
        d
          .addOption("embed", "Embed (![[note]])")
          .addOption("link", "Link ([[note]])")
          .setValue(this.plugin.settings.embedStyle)
          .onChange(async (v) => {
            this.plugin.settings.embedStyle = v as "embed" | "link";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-generate on startup")
      .setDesc("On Obsidian launch, generate the current week's notes if missing.")
      .addDropdown((d) =>
        d
          .addOption("off", "Off")
          .addOption("startup", "On startup")
          .setValue(this.plugin.settings.autoGenerate)
          .onChange(async (v) => {
            this.plugin.settings.autoGenerate = v as "off" | "startup";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Open today on launch")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.openTodayOnLaunch).onChange(async (v) => {
          this.plugin.settings.openTodayOnLaunch = v;
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("h3", { text: "Daily frontmatter" });
    this.renderFrontmatterEditor(containerEl, "dailyFrontmatter");

    containerEl.createEl("h3", { text: "Weekly frontmatter" });
    this.renderFrontmatterEditor(containerEl, "weeklyFrontmatter");
  }

  renderFrontmatterEditor(parent: HTMLElement, field: "dailyFrontmatter" | "weeklyFrontmatter") {
    const wrap = parent.createDiv();
    const list = this.plugin.settings[field];

    const rerender = () => {
      wrap.empty();
      list.forEach((entry, idx) => {
        const row = wrap.createDiv();
        row.style.display = "flex";
        row.style.gap = "6px";
        row.style.marginBottom = "4px";

        const keyInput = row.createEl("input", { type: "text", placeholder: "key" });
        keyInput.value = entry.key;
        keyInput.style.flex = "1";
        keyInput.oninput = async () => {
          entry.key = keyInput.value;
          await this.plugin.saveSettings();
        };

        const valInput = row.createEl("input", { type: "text", placeholder: "value (tokens allowed)" });
        valInput.value = entry.value;
        valInput.style.flex = "2";
        valInput.oninput = async () => {
          entry.value = valInput.value;
          await this.plugin.saveSettings();
        };

        const del = row.createEl("button", { text: "✕" });
        del.onclick = async () => {
          list.splice(idx, 1);
          await this.plugin.saveSettings();
          rerender();
        };
      });

      const addBtn = wrap.createEl("button", { text: "+ Add field" });
      addBtn.style.marginTop = "4px";
      addBtn.onclick = async () => {
        list.push({ key: "", value: "" });
        await this.plugin.saveSettings();
        rerender();
      };
    };

    rerender();
  }
}
