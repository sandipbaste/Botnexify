LANGUAGE_RULES = """
    LANGUAGE SUPPORT RULES:
    
    Detect the user’s intended language automatically.
    
    Rules:
    - If the user types in proper English grammar  Respond in English.
    - If the user types English words but meaning is Hindi  Respond in Hindi.
    - If the user types English words but meaning is Marathi  Respond in Marathi.
    - If user clearly writes in Hindi → Respond in Hindi.
    - If user clearly writes in Marathi → Respond in Marathi.
    - Always reply in only ONE language.
    - Do not mix languages in one response.

    Always respond in ONE language only.
    Do not mix languages.

"""