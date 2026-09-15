using System.Globalization;
using System.Text;

namespace E500Assembler;

public sealed class AssemblyException(string message) : Exception(message);

internal sealed class Expression(string text, Func<string, long> symbol, long pc)
{
    private int pos;
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
                "+" => checked(left + right), "-" => checked(left - right), "*" => checked(left * right),
                "/" => left / right, "%" => left % right, "&" => left & right, "|" => left | right, "^" => left ^ right,
                "<<" => right is >= 0 and <= 63 ? left << (int)right : throw new AssemblyException("Shift count must be 0..63"),
                ">>" => right is >= 0 and <= 63 ? left >> (int)right : throw new AssemblyException("Shift count must be 0..63"),
                _ => throw new AssemblyException("Invalid operator")
            };
        }
    }
    private long Atom()
    {
        Space();
        if (pos == text.Length) throw new AssemblyException("Expression expected");
        char ch = text[pos++];
        if (ch is '+' or '-' or '~') { long v = Atom(); return ch == '-' ? checked(-v) : ch == '~' ? ~v : v; }
        if (ch == '(') { long v = Binary(0); Space(); if (pos >= text.Length || text[pos++] != ')') throw new AssemblyException("Missing ')' in expression"); return v; }
        if (ch == '\'')
        {
            int start = pos - 1;
            while (pos < text.Length) { if (text[pos++] == '\\' && pos < text.Length) pos++; else if (text[pos - 1] == '\'') break; }
            string s = Syntax.String(text[start..pos]);
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
            else if (n.StartsWith("0b", StringComparison.OrdinalIgnoreCase)) { n = n[2..]; radix = 2; }
            else if (n.EndsWith('h') || n.EndsWith('H')) { n = n[..^1]; radix = 16; }
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
