from .system_prompt import SYSTEM_PROMPT
from .behavior_rules import BEHAVIOR_RULES
from .language_rules import LANGUAGE_RULES
from .followup_rules import FOLLOWUP_RULES
from .sales_rules import SALES_RULES


def build_system_prompt(
    website_id,
    context_text,
    user_greeting,
    conversation_history_text,
    last_assistant_list_text,
    follow_up_instruction,
    use_external=False
):

    external = "**INCLUDING EXTERNAL SEARCH RESULTS WHEN AVAILABLE**" if use_external else ""

    return (
        SYSTEM_PROMPT.format(
            website_id=website_id,
            context_text=context_text,
            user_greeting=user_greeting,
            conversation_history_text=conversation_history_text,
            last_assistant_list_text=last_assistant_list_text,
            follow_up_instruction=follow_up_instruction
        )
        + external
        + BEHAVIOR_RULES
        + FOLLOWUP_RULES
        + SALES_RULES
        + LANGUAGE_RULES
    )