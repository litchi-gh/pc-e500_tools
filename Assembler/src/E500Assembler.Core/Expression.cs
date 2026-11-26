using System.Globalization;
using System.Text;

namespace E500Assembler;

public class AssemblyException(string message) : Exception(message);
/// <summary>A value that does not work out (a shift of 64, a division by zero ...): in a pass that does not have all the names yet, it may still come right.</summary>
internal sealed class ValueException(string message) : AssemblyException(message);

internal sealed class Expression(string text, Func<string, long> symbol, long pc)
{
    private int pos, depth;
    public long Evaluate()
    {
        long value = Binary(0);
        Space();
        if (pos != text.Length) throw new AssemblyException($"Unexpected expression text: {text[pos..]}");
        return value;
    }
    private void Space() { while (pos < text.Length && char.IsWhiteSpace(text[pos])) pos++; }
    private long Binary(int minimum)
    {
        long left = Atom();
        while (true)
        {
            Space();
            string op = pos + 1 < text.Length && text.Substring(pos, 2) is "<<" or ">>" ? text.Substring(pos, 2) : pos < text.Length ? text[pos].ToString() : "";
            int priority = op switch { "|" => 1, "^" => 2, "&" => 3, "<<" or ">>" => 4, "+" or "-" => 5, "*" or "/" or "%" => 6, _ => -1 };
            if (priority < minimum) return left;
            pos += op.Length;
            long right = Binary(priority + 1);
            left = op switch
            {
                "+" or "-" or "*" => Checked(op, left, right),
                "/" or "%" when right == 0 => throw new ValueException("Division by zero"),
                "/" or "%" when right == -1 => op == "/" ? Checked("-", 0, left) : 0,
                "/" => left / right, "%" => left % right, "&" => left & right, "|" => left | right, "^" => left ^ right,
                "<<" => right is >= 0 and <= 63 ? left << (int)right : throw new ValueException("Shift count must be 0..63"),
                ">>" => right is >= 0 and <= 63 ? left >> (int)right : throw new ValueException("Shift count must be 0..63"),
                _ => throw new AssemblyException("Invalid operator")
            };
        }
    }
    private static long Checked(string op, long a, long b)
    {
        try { return checked(op switch { "+" => a + b, "-" => a - b, _ => a * b }); }
        catch (OverflowException) { throw new ValueException("The result does not fit in 64 bits"); }
    }
    private long Atom()
    {
        // Deeper than anyone writes, and well inside the stack.
        if (++depth > 200) throw new AssemblyException("Expression is nested too deeply");
        try { return Primary(); } finally { depth--; }
    }
    private long Primary()
    {
        Space();
        if (pos == text.Length) throw new AssemblyException("Expression expected");
        char ch = text[pos++];
        if (ch is '+' or '-' or '~') { long v = Atom(); return ch == '-' ? Checked("-", 0, v) : ch == '~' ? ~v : v; }
        if (ch == '(') { long v = Binary(0); Space(); if (pos >= text.Length || text[pos++] != ')') throw new AssemblyException("Missing ')' in expression"); return v; }
        if (ch == '\'')
        {
            int start = pos - 1;
            while (pos < text.Length) { if (text[pos++] == '\\' && pos < text.Length) pos++; else if (text[pos - 1] == '\'') break; }
            string s = Syntax.Bytes(text[start..pos]);
            if (s.Length != 1 || s[0] > 255) throw new AssemblyException("Character literal must contain one byte");
            return s[0];
        }
        if (ch == '$' && (pos == text.Length || !Uri.IsHexDigit(text[pos]))) return pc;
        if (ch == '*' ) return pc;
        if (char.IsDigit(ch) || ch is '$' or '&')
        {
            int start = pos - 1;
            while (pos < text.Length && (char.IsLetterOrDigit(text[pos]) || text[pos] == '_')) pos++;
            string n = text[start..pos].Replace("_", "");
            int radix = 10;
            if (n[0] is '$' or '&') { n = n[1..]; radix = 16; }
            else if (n.StartsWith("0x", StringComparison.OrdinalIgnoreCase)) { n = n[2..]; radix = 16; }
            else if (n.EndsWith('h') || n.EndsWith('H')) { n = n[..^1]; radix = 16; } // before 0b: 0B8000h is hexadecimal
            else if (n.StartsWith("0b", StringComparison.OrdinalIgnoreCase)) { n = n[2..]; radix = 2; }
            // Convert takes a 0x of its own.
            if (radix == 16 && !n.All(Uri.IsHexDigit)) throw new AssemblyException($"Invalid number: {text[start..pos]}");
            try { return Convert.ToInt64(n, radix); } catch (Exception e) when (e is FormatException or OverflowException or ArgumentException) { throw new AssemblyException($"Invalid number: {text[start..pos]}"); }
        }
        if (char.IsLetter(ch) || ch is '_' or '.')
        {
            int start = pos - 1;
            while (pos < text.Length && (char.IsLetterOrDigit(text[pos]) || text[pos] is '_' or '.')) pos++;
            string name = text[start..pos];
            Space();
            if (pos < text.Length && text[pos] == '(')
            {
                pos++; long v = Binary(0); Space();
                if (pos >= text.Length || text[pos++] != ')') throw new AssemblyException("Missing ')' after function");
                return name.ToUpperInvariant() switch { "LOW" => v & 255, "HIGH" => (v >> 8) & 255, "BANK" => (v >> 16) & 15, _ => throw new AssemblyException($"Unknown function: {name}") };
            }
            return symbol(name);
        }
        throw new AssemblyException($"Unexpected character in expression: {ch}");
    }
}

internal static class Syntax
{
    public static string StripComment(string s)
    {
        char quote = '\0';
        for (int i = 0; i < s.Length; i++)
        {
            if (quote != '\0') { if (s[i] == '\\') i++; else if (s[i] == quote) quote = '\0'; }
            else if (s[i] is '\'' or '"') quote = s[i];
            else if (s[i] == ';') return s[..i];
        }
        if (quote != '\0') throw new AssemblyException("Unterminated string");
        return s;
    }
    public static string[] Split(string s)
    {
        if (string.IsNullOrWhiteSpace(s)) return [];
        var parts = new List<string>(); int start = 0; var brackets = new Stack<char>(); char quote = '\0';
        for (int i = 0; i < s.Length; i++)
        {
            char c = s[i];
            if (quote != '\0') { if (c == '\\') i++; else if (c == quote) quote = '\0'; continue; }
            if (c is '\'' or '"') quote = c;
            else if (c is '(' or '[') brackets.Push(c);
            else if (c is ')' or ']') { if (brackets.Count == 0 || brackets.Pop() != (c == ')' ? '(' : '[')) throw new AssemblyException("Unbalanced brackets"); }
            else if (c == ',' && brackets.Count == 0) { parts.Add(s[start..i].Trim()); start = i + 1; }
        }
        if (quote != '\0' || brackets.Count != 0) throw new AssemblyException("Unterminated string or bracket");
        parts.Add(s[start..].Trim());
        if (parts.Any(p => p.Length == 0)) throw new AssemblyException("Empty operand");
        return parts.ToArray();
    }
    /// <summary>A string for DB or a character constant: the characters as written are 7-bit, others come as \xNN. Anything else would be taken for a code the PC-E500 shows as something else.</summary>
    public static string Bytes(string s)
    {
        if (s.FirstOrDefault(c => c > 0x7f) is char bad && bad != '\0') throw new AssemblyException($"'{bad}' is not a character of the PC-E500 as it is; write its code as a number or \\xNN");
        return String(s);
    }
    public static string String(string s)
    {
        if (s.Length < 2 || s[0] is not ('"' or '\'') || s[^1] != s[0]) throw new AssemblyException("Quoted string expected");
        var result = new StringBuilder();
        for (int i = 1; i < s.Length - 1; i++)
        {
            char c = s[i];
            if (c == s[0]) throw new AssemblyException("Unexpected quote in string");
            if (c == '\\')
            {
                if (++i >= s.Length - 1) throw new AssemblyException("Incomplete escape");
                c = s[i] switch { 'n' => '\n', 'r' => '\r', 't' => '\t', '0' => '\0', '\\' => '\\', '\'' => '\'', '"' => '"', 'x' => '\0', _ => throw new AssemblyException("Unknown string escape") };
                if (s[i] == 'x')
                {
                    if (i + 2 >= s.Length - 1 || !byte.TryParse(s.Substring(i + 1, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out byte b)) throw new AssemblyException("\\x needs two hex digits");
                    c = (char)b; i += 2;
                }
            }
            result.Append(c);
        }
        return result.ToString();
    }
}
