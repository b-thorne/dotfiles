import { homedir, hostname, userInfo } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
	CustomEditor,
	type ExtensionAPI,
	type ExtensionContext,
	type KeybindingsManager,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	truncateToWidth,
	type EditorTheme,
	type TUI,
} from "@earendil-works/pi-tui";

const PROMPT = "π ❯";
const PROMPT_WIDTH = 4;
const ANSI_CSI = /\x1b\[[0-?]*[ -/]*[@-~]/g;

function formatCwd(cwd: string): string {
	const home = resolve(homedir());
	const resolved = resolve(cwd);
	const rel = relative(home, resolved);
	const insideHome = rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
	if (!insideHome) return cwd;
	return rel === "" ? "~" : `~${sep}${rel}`;
}

function isEditorBorder(line: string): boolean {
	const plain = line.replace(ANSI_CSI, "");
	return /^─+$/.test(plain) || /^─── [↑↓] \d+ more ─*$/.test(plain);
}

function identityLine(theme: Theme, cwd: string): string {
	const user = process.env.USER || userInfo().username;
	const host = hostname().split(".")[0] || hostname();
	return theme.fg("thinkingXhigh", `${user} @ ${host} ${formatCwd(cwd)}`);
}

class StarshipEditor extends CustomEditor {
	constructor(
		tui: TUI,
		editorTheme: EditorTheme,
		keybindings: KeybindingsManager,
		private readonly getUiTheme: () => Theme,
		private readonly cwd: string,
	) {
		super(tui, editorTheme, keybindings);
	}

	render(width: number): string[] {
		if (width <= PROMPT_WIDTH) return super.render(width);

		const uiTheme = this.getUiTheme();
		const innerWidth = width - PROMPT_WIDTH;
		const rendered = super.render(innerWidth);
		const bottomBorder = rendered.findIndex((line, index) => index > 0 && isEditorBorder(line));

		if (bottomBorder < 0) return rendered;

		const inputLines = rendered.slice(1, bottomBorder);
		const autocompleteLines = rendered.slice(bottomBorder + 1);
		const prefix = uiTheme.fg("thinkingXhigh", PROMPT) + " ";
		const indent = " ".repeat(PROMPT_WIDTH);

		return [
			truncateToWidth(identityLine(uiTheme, this.cwd), width, ""),
			...inputLines.map((line, index) => (index === 0 ? prefix : indent) + line),
			...autocompleteLines.map((line) => indent + line),
		];
	}
}

function applyFooter(ctx: ExtensionContext): void {
	ctx.ui.setFooter((tui, theme, footerData) => {
		const unsubscribe = footerData.onBranchChange(() => tui.requestRender());
		return {
			dispose: unsubscribe,
			invalidate() {},
			render(width: number): string[] {
				const model = ctx.model?.id ?? "no model";
				const usage = ctx.getContextUsage();
				const context = usage?.percent == null ? "" : ` · ${Math.round(usage.percent)}% ctx`;
				return [
					truncateToWidth(
						theme.fg("muted", model) + theme.fg("dim", context),
						width,
						"",
					),
				];
			},
		};
	});
}

export default function starshipUi(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		ctx.ui.setTitle("pi");
		ctx.ui.setEditorComponent((tui, theme, keybindings) =>
			new StarshipEditor(tui, theme, keybindings, () => ctx.ui.theme, ctx.cwd),
		);
		applyFooter(ctx);
	});
}
