namespace E500DebugServer;

/// <summary>Japanese or English for the messages, as the extension asks (--lang ja|en).</summary>
internal static class Lang
{
    internal static bool English;

    /// <summary>The text in the language in use.</summary>
    internal static string L(string ja, string en) => English ? en : ja;
}
