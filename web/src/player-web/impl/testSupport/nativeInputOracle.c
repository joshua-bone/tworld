/* Execute the repository's real keyboard state machine without a window.
 * Only OS event delivery, keyboard hardware state, and unused logging are stubbed.
 */
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include "in.c"

genericglobals geng;
int casualinputs = TRUE; /* tworld.c's default, not oracle_main.cpp's replay mode. */
char const *err_cfile_;
unsigned long err_lineno_;
static char events[256];

uint8_t *TW_GetKeyState(int *count) {
    static uint8_t keys[TWK_LAST];
    *count = TWK_LAST;
    return keys;
}
int setkeyboardrepeat(int enable) { return TRUE; }
void warn_(char const *fmt, ...) { fputs("unexpected native warning\n", stderr); exit(1); }

static void deliver_events(int wait) {
    for (char const *event = events; *event; ++event) {
        int key;
        switch (toupper((unsigned char)*event)) {
            case 'N': key = TWK_UP; break;
            case 'W': key = TWK_LEFT; break;
            case 'S': key = TWK_DOWN; break;
            case 'E': key = TWK_RIGHT; break;
            default: continue;
        }
        keyeventcallback(key, isupper((unsigned char)*event));
    }
}

int main(void) {
    _genericinputinitialize();
    geng.eventupdatefunc = deliver_events;
    setkeyboardarrowsrepeat(FALSE); /* play.c's MS ruleset behavior. */
    while (fgets(events, sizeof events, stdin)) printf("%d\n", input(FALSE));
    return 0;
}
