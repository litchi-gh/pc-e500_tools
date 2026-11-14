using System.Globalization;
using System.Text;

namespace E500Disassembler.Gui;

internal sealed class MainForm : Form
{
    private readonly TextBox input = new() { Dock = DockStyle.Fill };
    private readonly TextBox output = new() { Dock = DockStyle.Fill };
    private readonly ComboBox format = new() { DropDownStyle = ComboBoxStyle.DropDownList, Dock = DockStyle.Fill };
    private readonly TextBox origin = new() { Text = "B8000", Dock = DockStyle.Fill };
    private readonly CheckBox labels = new() { Text = "分岐先ラベルを生成", Checked = true, AutoSize = true };
    private readonly CheckBox addresses = new() { Text = "アドレスをコメント表示", Checked = true, AutoSize = true };
    private readonly CheckBox bytes = new() { Text = "機械語をコメント表示", Checked = true, AutoSize = true };
    private readonly Button execute = new() { Text = "逆アセンブル", AutoSize = true, Padding = new(12, 4, 12, 4) };
    private readonly TextBox preview = new() { Dock = DockStyle.Fill, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, WordWrap = false, Font = new Font("Consolas", 10) };
    private readonly ToolStripStatusLabel status = new() { Text = "入力ファイルと形式を選択してください" };

    public MainForm()
    {
        Text = "PC-E500 逆アセンブラ"; Width = 940; Height = 700; MinimumSize = new(720, 520);
        AllowDrop = true;
        format.Items.AddRange(["RAWデータ", "CE-140F SAVE M（16バイトヘッダ付き）"]); format.SelectedIndex = 0;

        var table = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 3, Padding = new Padding(10) };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize)); table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); table.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        AddRow(table, 0, "入力ファイル", input, Button("参照...", BrowseInput));
        AddRow(table, 1, "入力形式", format, new Panel { Width = 1 });
        AddRow(table, 2, "RAW開始アドレス", origin, new Label { Text = "16進数（例 B8000）", AutoSize = true, Anchor = AnchorStyles.Left });
        AddRow(table, 3, "出力ASM", output, Button("参照...", BrowseOutput));

        var options = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(10, 0, 10, 8) };
        options.Controls.AddRange([labels, addresses, bytes, execute]);
        var statusStrip = new StatusStrip(); statusStrip.Items.Add(status);
        Controls.Add(preview); Controls.Add(options); Controls.Add(table); Controls.Add(statusStrip);

        format.SelectedIndexChanged += (_, _) => { origin.Enabled = format.SelectedIndex == 0; };
        execute.Click += async (_, _) => await ExecuteAsync();
        DragEnter += (_, e) => { if (e.Data?.GetDataPresent(DataFormats.FileDrop) == true) e.Effect = DragDropEffects.Copy; };
        DragDrop += (_, e) => { if (e.Data?.GetData(DataFormats.FileDrop) is string[] files && files.Length != 0) SetInput(files[0]); };
    }

    private static void AddRow(TableLayoutPanel table, int row, string title, Control field, Control action)
    {
        table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        table.Controls.Add(new Label { Text = title, AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(3, 7, 8, 3) }, 0, row);
        table.Controls.Add(field, 1, row); table.Controls.Add(action, 2, row);
    }
    private static Button Button(string text, EventHandler click) { var b = new Button { Text = text, AutoSize = true }; b.Click += click; return b; }
    private void BrowseInput(object? sender, EventArgs e)
    {
        using var dialog = new OpenFileDialog { Title = "RAWまたはCE-140F SAVE Mファイルを選択", Filter = "すべてのファイル (*.*)|*.*" };
        if (dialog.ShowDialog(this) == DialogResult.OK) SetInput(dialog.FileName);
    }
    private void SetInput(string path)
    {
        input.Text = path; output.Text = Path.ChangeExtension(path, ".asm"); preview.Clear();
        try
        {
            byte[] head = File.ReadAllBytes(path).Take(16).ToArray();
            if (head.Length == 16 && head.AsSpan(0, 5).SequenceEqual(new byte[] { 0xff, 0, 6, 1, 0x10 })) format.SelectedIndex = 1;
        }
        catch (IOException) { }
    }
    private void BrowseOutput(object? sender, EventArgs e)
    {
        using var dialog = new SaveFileDialog { Title = "アセンブリソースの保存先", Filter = "Assembly source (*.asm)|*.asm|すべてのファイル (*.*)|*.*", FileName = Path.GetFileName(output.Text) };
        if (input.TextLength != 0) dialog.InitialDirectory = Path.GetDirectoryName(input.Text);
        if (dialog.ShowDialog(this) == DialogResult.OK) output.Text = dialog.FileName;
    }
    private int RawOrigin()
    {
        string text = origin.Text.Trim();
        if (text.StartsWith("0x", StringComparison.OrdinalIgnoreCase)) text = text[2..];
        if (text.StartsWith('$') || text.StartsWith('&')) text = text[1..];
        if (text.EndsWith("h", StringComparison.OrdinalIgnoreCase)) text = text[..^1];
        if (!int.TryParse(text, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out int value) || value > 0xfffff)
            throw new DisassemblyException("RAW開始アドレスは00000～FFFFFの16進数で指定してください");
        return value;
    }
    private async Task ExecuteAsync()
    {
        execute.Enabled = false; UseWaitCursor = true; status.Text = "逆アセンブル中...";
        try
        {
            string inPath = Path.GetFullPath(input.Text), outPath = Path.GetFullPath(output.Text);
            if (inPath == outPath) throw new DisassemblyException("出力先は入力ファイルと別の名前にしてください");
            InputFormat selected = format.SelectedIndex == 0 ? InputFormat.Raw : InputFormat.Ce140f;
            int? address = selected == InputFormat.Raw ? RawOrigin() : null;
            var settings = new DisassemblerOptions { GenerateLabels = labels.Checked, ShowAddresses = addresses.Checked, ShowBytes = bytes.Checked };
            var result = await Task.Run(() => new Disassembler().DisassembleFile(inPath, selected, address, settings));
            Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
            string temp = outPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try { await File.WriteAllTextAsync(temp, result.Source, new UTF8Encoding(false)); File.Move(temp, outPath, true); }
            finally { if (File.Exists(temp)) File.Delete(temp); }
            preview.Text = result.Source;
            status.Text = $"完了: {result.Image.Payload.Length}バイト / {result.InstructionCount}命令 / DB {result.DataByteCount}バイト  →  {outPath}";
        }
        catch (Exception ex) when (ex is DisassemblyException or IOException or UnauthorizedAccessException or ArgumentException)
        { status.Text = "エラー"; MessageBox.Show(this, ex.Message, "逆アセンブルできません", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        finally { UseWaitCursor = false; execute.Enabled = true; }
    }
}
