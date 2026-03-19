#include <algorithm>
#include <cctype>
#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

extern "C" {
#include "../defs.h"
#include "../encoding.h"
#include "../err.h"
#include "../fileio.h"
#include "../oshw.h"
#include "../play.h"
#include "../random.h"
#include "../res.h"
#include "../score.h"
#include "../series.h"
#include "../solution.h"
#include "../state.h"
#include "../unslist.h"
}

extern "C" int mslogicoraclecreaturecount(void);
extern "C" creature* const* mslogicoraclecreatures(void);
extern "C" int mslogicoracleblockcount(void);
extern "C" creature* const* mslogicoracleblocks(void);
extern "C" int mslogicoracleslipcount(void);
extern "C" creature const* mslogicoracleslipcreature(int index);
extern "C" int mslogicoracleslipdir(int index);
extern "C" int mslogicoraclemsccslippers(void);
extern "C" void tworldoraclesetphasecallback(void (*callback)(char const*, gamestate const*));

char* resdir = NULL;
int casualinputs = FALSE;

static int g_timer_second_ms = 1000;
static int g_current_tick = 0;

extern "C" void ding(void) {}

extern "C" void setsubtitle(char const* subtitle)
{
    (void)subtitle;
}

extern "C" void usermessage(int action, char const* prefix,
                            char const* cfile, unsigned long lineno,
                            char const* fmt, va_list args)
{
    FILE* out = action == NOTIFY_LOG ? stderr : stderr;

    if (prefix && *prefix)
        std::fprintf(out, "%s: ", prefix);
    if (cfile && *cfile)
        std::fprintf(out, "[%s:%lu] ", cfile, lineno);
    std::vfprintf(out, fmt, args);
    std::fputc('\n', out);
}

extern "C" int displaytiletable(char const* title, tiletablerow const* rows,
                                int count, int completed)
{
    (void)title;
    (void)rows;
    (void)count;
    (void)completed;
    return FALSE;
}

extern "C" int displaytable(char const* title, tablespec const* table,
                            int completed)
{
    (void)title;
    (void)table;
    (void)completed;
    return FALSE;
}

extern "C" int getselectedruleset(void)
{
    return Ruleset_MS;
}

extern "C" void readextensions(struct gameseries* series)
{
    (void)series;
}

extern "C" int getreplaysecondstoskip(void)
{
    return 0;
}

extern "C" void copytoclipboard(char const* text)
{
    (void)text;
}

extern "C" void settimer(int action)
{
    if (action < 0)
        g_current_tick = 0;
}

extern "C" void settimersecond(int ms)
{
    g_timer_second_ms = ms ? ms : 1000;
}

extern "C" int gettickcount(void)
{
    return g_current_tick;
}

extern "C" int waitfortick(void)
{
    ++g_current_tick;
    return TRUE;
}

extern "C" int advancetick(void)
{
    ++g_current_tick;
    return TRUE;
}

extern "C" int setkeyboardrepeat(int enable)
{
    (void)enable;
    return TRUE;
}

extern "C" int setkeyboardarrowsrepeat(int enable)
{
    (void)enable;
    return TRUE;
}

extern "C" int setkeyboardinputmode(int enable)
{
    (void)enable;
    return TRUE;
}

extern "C" int loadfontfromfile(char const* filename, int complain)
{
    (void)filename;
    (void)complain;
    return TRUE;
}

extern "C" void freefont(void) {}

extern "C" int loadtileset(char const* filename, int complain)
{
    (void)filename;
    (void)complain;
    return TRUE;
}

extern "C" void freetileset(void) {}

extern "C" int creategamedisplay(void)
{
    return TRUE;
}

extern "C" void setcolors(long bkgnd, long text, long bold, long dim)
{
    (void)bkgnd;
    (void)text;
    (void)bold;
    (void)dim;
}

extern "C" void cleardisplay(void) {}

extern "C" int displaygame(struct gamestate const* state,
                            int timeleft, int besttime, int showinitstate)
{
    (void)state;
    (void)timeleft;
    (void)besttime;
    (void)showinitstate;
    return TRUE;
}

extern "C" int displayendmessage(int basescore, int timescore,
                                  long totalscore, int completed)
{
    (void)basescore;
    (void)timescore;
    (void)totalscore;
    (void)completed;
    return CmdNone;
}

extern "C" int setdisplaymsg(char const* msg, int msecs, int bold)
{
    (void)msg;
    (void)msecs;
    (void)bold;
    return TRUE;
}

extern "C" void playsoundeffects(unsigned long sfx)
{
    (void)sfx;
}

extern "C" void setsoundeffects(int action)
{
    (void)action;
}

extern "C" int loadgameresources(int ruleset)
{
    (void)ruleset;
    return TRUE;
}

extern "C" void setintsetting(char const* name, int val)
{
    (void)name;
    (void)val;
}

namespace {

bool debug_active_creatures_enabled()
{
    static int cached = -1;
    if (cached < 0) {
        char const* env = std::getenv("TWORLD_ORACLE_DEBUG_ACTIVE");
        cached = (env && *env) ? 1 : 0;
    }
    return cached != 0;
}

struct OracleOptions {
    std::string series_dir = "./sets";
    std::string data_dir = "./data";
    std::string save_dir = "./save";
    std::string res_dir = "./res";
};

struct ScheduledInput {
    int tick;
    int cmd;
};

struct MapCreatureEntry {
    int pos;
    int layer;
    unsigned char id;
    unsigned char dir;
    unsigned char state;
};

enum : unsigned char {
    ORACLE_CS_RELEASED = 0x01,
    ORACLE_CS_CLONING = 0x02,
    ORACLE_CS_HASMOVED = 0x04,
    ORACLE_CS_TURNING = 0x08,
    ORACLE_CS_SLIP = 0x10,
    ORACLE_CS_SLIDE = 0x20,
    ORACLE_CS_DEFERPUSH = 0x40,
    ORACLE_CS_MUTANT = 0x80,
};

enum : unsigned char {
    ORACLE_FS_BUTTONDOWN = 0x01,
    ORACLE_FS_CLONING = 0x02,
    ORACLE_FS_BROKEN = 0x04,
    ORACLE_FS_HASMUTANT = 0x08,
    ORACLE_FS_MARKER = 0x10,
};

enum {
    ORACLE_CHIP_OKAY = 0,
    ORACLE_CHIP_DROWNED,
    ORACLE_CHIP_BURNED,
    ORACLE_CHIP_BOMBED,
    ORACLE_CHIP_OUTOFTIME,
    ORACLE_CHIP_COLLIDED,
    ORACLE_CHIP_SQUISHED,
    ORACLE_CHIP_SQUISHED_DEATH,
    ORACLE_CHIP_NOTOKAY,
};

struct RuntimeCreatureEntry {
    int index;
    int pos;
    unsigned char id;
    unsigned char dir;
    signed char moving;
    signed char frame;
    unsigned char hidden;
    unsigned char state;
    unsigned char tdir;
    int floor_id;
    unsigned char floor_state;
    int floor_dir;
    std::string floor_mode;
};

struct SlipRuntimeEntry {
    int index;
    int creature_index;
    int block_index;
    int dir;
    RuntimeCreatureEntry creature;
};

struct BoardFlagEntry {
    int pos;
    int layer;
    unsigned char id;
    unsigned char state;
};

struct DebugMapCell {
    int pos;
    unsigned char top_id;
    unsigned char top_state;
    unsigned char bottom_id;
    unsigned char bottom_state;
};

struct DebugPhaseSnapshot {
    std::string phase;
    int tick;
    int current_time;
    int replay_cursor;
    int current_input;
    int last_move;
    int status_flags;
    int chips_needed;
    int chip_wait;
    int chip_status;
    int controller_dir;
    int last_slip_dir;
    int goal_pos;
    int completed;
    int mscc_slippers;
    unsigned long sound_effects;
    int chip_floor_id;
    unsigned char chip_floor_state;
    int chip_floor_dir;
    std::string chip_floor_mode;
    unsigned long long map_hash;
    unsigned long long creatures_hash;
    std::vector<RuntimeCreatureEntry> active_creatures;
    std::vector<RuntimeCreatureEntry> blocks;
    std::vector<SlipRuntimeEntry> slip_list;
    std::vector<BoardFlagEntry> board_flags;
    std::vector<DebugMapCell> map_cells;
};

struct TraceOptions {
    bool debug = false;
    int debug_schema_version = 0;
    bool has_step_window = false;
    int step_window_start = 0;
    int step_window_end_exclusive = 0;
};

std::vector<DebugPhaseSnapshot>* g_debug_phase_sink = NULL;

std::string join_path(char const* dir, char const* path)
{
    std::unique_ptr<char, decltype(&std::free)> buffer(getpathbuffer(), &std::free);
    if (!combinepath(buffer.get(), dir, path))
        memerrexit();
    return std::string(buffer.get());
}

struct ScopedDirs {
    explicit ScopedDirs(OracleOptions const& options)
    {
        seriesdir = dup(options.series_dir.c_str());
        seriesdatdir = dup(options.data_dir.c_str());
        savedir = dup(options.save_dir.c_str());
        resdir = dup(options.res_dir.c_str());
        finddir(savedir);
        loadunslistfromfile("unslist.txt");
    }

    ~ScopedDirs()
    {
        clearunslist();
        std::free(seriesdir);
        std::free(seriesdatdir);
        std::free(savedir);
        std::free(resdir);
        seriesdir = NULL;
        seriesdatdir = NULL;
        savedir = NULL;
        resdir = NULL;
    }

    static char* dup(char const* value)
    {
        size_t len = std::strlen(value) + 1;
        char* out = static_cast<char*>(std::malloc(len));
        if (!out)
            memerrexit();
        std::memcpy(out, value, len);
        return out;
    }
};

int parse_global_options(int argc, char** argv, OracleOptions* options)
{
    int index = 1;

    while (index < argc) {
        char const* arg = argv[index];
        if (!std::strcmp(arg, "--help"))
            return -1;
        if (!std::strcmp(arg, "--root")) {
            if (index + 1 >= argc) {
                std::fprintf(stderr, "--root requires a path\n");
                return -2;
            }
            char const* root = argv[index + 1];
            options->series_dir = join_path(root, "sets");
            options->data_dir = join_path(root, "data");
            options->save_dir = join_path(root, "save");
            options->res_dir = join_path(root, "res");
            index += 2;
            continue;
        }
        if (!std::strcmp(arg, "--series-dir")) {
            if (index + 1 >= argc) {
                std::fprintf(stderr, "--series-dir requires a path\n");
                return -2;
            }
            options->series_dir = argv[index + 1];
            index += 2;
            continue;
        }
        if (!std::strcmp(arg, "--data-dir")) {
            if (index + 1 >= argc) {
                std::fprintf(stderr, "--data-dir requires a path\n");
                return -2;
            }
            options->data_dir = argv[index + 1];
            index += 2;
            continue;
        }
        if (!std::strcmp(arg, "--save-dir")) {
            if (index + 1 >= argc) {
                std::fprintf(stderr, "--save-dir requires a path\n");
                return -2;
            }
            options->save_dir = argv[index + 1];
            index += 2;
            continue;
        }
        if (!std::strcmp(arg, "--res-dir")) {
            if (index + 1 >= argc) {
                std::fprintf(stderr, "--res-dir requires a path\n");
                return -2;
            }
            options->res_dir = argv[index + 1];
            index += 2;
            continue;
        }
        if (arg[0] == '-') {
            std::fprintf(stderr, "unknown option: %s\n", arg);
            return -2;
        }
        break;
    }

    return index;
}

std::string escape_json(char const* value)
{
    std::string out;
    if (!value)
        return out;

    for (unsigned char ch = static_cast<unsigned char>(*value);
         ch != '\0';
         ch = static_cast<unsigned char>(*++value)) {
        switch (ch) {
            case '\\': out += "\\\\"; break;
            case '"': out += "\\\""; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (ch < 0x20 || ch >= 0x7F) {
                    char buf[7];
                    std::snprintf(buf, sizeof buf, "\\u%04x", ch);
                    out += buf;
                } else {
                    out += static_cast<char>(ch);
                }
                break;
        }
    }

    return out;
}

char const* ruleset_name(int ruleset)
{
    switch (ruleset) {
        case Ruleset_Lynx: return "Lynx";
        case Ruleset_MS: return "MS";
        default: return "None";
    }
}

std::string direction_name(int dir)
{
    switch (dir) {
        case NIL: return "none";
        case NORTH: return "north";
        case WEST: return "west";
        case SOUTH: return "south";
        case EAST: return "east";
        default: {
            char buf[32];
            std::snprintf(buf, sizeof buf, "dir-%d", dir);
            return std::string(buf);
        }
    }
}

std::string command_name(int cmd)
{
    switch (cmd) {
        case CmdNone: return "none";
        case CmdPreserve: return "preserve";
        case CmdNorth: return "north";
        case CmdWest: return "west";
        case CmdSouth: return "south";
        case CmdEast: return "east";
        default: {
            char buf[32];
            std::snprintf(buf, sizeof buf, "cmd-%d", cmd);
            return std::string(buf);
        }
    }
}

char const* chip_status_name(int status)
{
    switch (status) {
        case ORACLE_CHIP_OKAY: return "okay";
        case ORACLE_CHIP_DROWNED: return "drowned";
        case ORACLE_CHIP_BURNED: return "burned";
        case ORACLE_CHIP_BOMBED: return "bombed";
        case ORACLE_CHIP_OUTOFTIME: return "out-of-time";
        case ORACLE_CHIP_COLLIDED: return "collided";
        case ORACLE_CHIP_SQUISHED: return "squished";
        case ORACLE_CHIP_SQUISHED_DEATH: return "squished-death";
        case ORACLE_CHIP_NOTOKAY: return "not-okay";
        default: return "unknown";
    }
}

char const* trace_status_name(int outcome)
{
    if (outcome > 0)
        return "completed";
    if (outcome < 0)
        return "failed";
    return "playing";
}

void print_json_string(char const* value)
{
    std::printf("\"%s\"", escape_json(value).c_str());
}

void print_unsigned_long_json(unsigned long value)
{
    char buf[32];
    std::snprintf(buf, sizeof buf, "%lu", value);
    print_json_string(buf);
}

void print_table_json(tablespec const& table)
{
    int item_index = 0;

    std::printf("{\"rows\":%d,\"cols\":%d,\"sep\":%d,\"collapse\":%d,\"data\":[",
                table.rows, table.cols, table.sep, table.collapse);

    for (int row = 0; row < table.rows; ++row) {
        if (row)
            std::printf(",");
        std::printf("[");

        for (int col = 0, cell_index = 0; col < table.cols; ++cell_index) {
            char const* item = table.items[item_index++];
            int span = item[0] - '0';
            char align = item[1];

            if (cell_index)
                std::printf(",");
            std::printf("{\"span\":%d,\"align\":\"%c\",\"text\":", span, align);
            print_json_string(item + 2);
            std::printf("}");

            col += span;
        }

        std::printf("]");
    }

    std::printf("]}");
}

int load_single_series(char const* preferred, gameseries* out)
{
    gameseries* list = NULL;
    mapfileinfo* mflist = NULL;
    tablespec table = {0};
    int count = 0;
    int mfcount = 0;
    int index = -1;

    std::memset(out, 0, sizeof *out);

    if (!createserieslist(NULL, &list, &count, &mflist, &mfcount, &table))
        return FALSE;

    for (int i = 0; i < count; ++i) {
        if (!std::strcmp(list[i].name, preferred) || !std::strcmp(list[i].filebase, preferred)) {
            index = i;
            break;
        }
    }

    if (index < 0) {
        std::fprintf(stderr, "unknown series: %s\n", preferred);
        freeserieslist(list, count, mflist, mfcount, &table);
        return FALSE;
    }

    getseriesfromlist(out, list, index);
    freeserieslist(list, count, mflist, mfcount, &table);

    if (!readseriesfile(out))
        return FALSE;

    return TRUE;
}

gamesetup* find_game_by_number(gameseries* series, int number, int* index)
{
    for (int i = 0; i < series->count; ++i) {
        if (series->games[i].number == number) {
            if (index)
                *index = i;
            return &series->games[i];
        }
    }
    return NULL;
}

void hash_byte(unsigned long long* hash, unsigned char value)
{
    *hash ^= value;
    *hash *= 1099511628211ULL;
}

void hash_int(unsigned long long* hash, int value)
{
    for (int shift = 0; shift < 32; shift += 8)
        hash_byte(hash, static_cast<unsigned char>((value >> shift) & 0xFF));
}

unsigned long long hash_map(gamestate const* state)
{
    unsigned long long hash = 1469598103934665603ULL;

    for (int i = 0; i < CXGRID * CYGRID; ++i) {
        hash_byte(&hash, state->map[i].top.id);
        hash_byte(&hash, state->map[i].top.state);
        hash_byte(&hash, state->map[i].bot.id);
        hash_byte(&hash, state->map[i].bot.state);
    }

    return hash;
}

bool is_chip_like(unsigned char id)
{
    unsigned char base = creatureid(id);
    return base == Chip || base == Pushing_Chip || base == Swimming_Chip;
}

std::vector<MapCreatureEntry> collect_map_creatures(gamestate const* state)
{
    std::vector<MapCreatureEntry> creatures;

    for (int pos = 0; pos < CXGRID * CYGRID; ++pos) {
        unsigned char top_id = state->map[pos].top.id;
        unsigned char bot_id = state->map[pos].bot.id;

        if (iscreature(top_id)) {
            creatures.push_back({pos, 1, static_cast<unsigned char>(creatureid(top_id)),
                                 static_cast<unsigned char>(creaturedirid(top_id)),
                                 state->map[pos].top.state});
        }
        if (iscreature(bot_id)) {
            creatures.push_back({pos, 0, static_cast<unsigned char>(creatureid(bot_id)),
                                 static_cast<unsigned char>(creaturedirid(bot_id)),
                                 state->map[pos].bot.state});
        }
    }

    return creatures;
}

std::vector<DebugMapCell> capture_map_cells(gamestate const* state)
{
    std::vector<DebugMapCell> cells;
    cells.reserve(CXGRID * CYGRID);

    for (int pos = 0; pos < CXGRID * CYGRID; ++pos) {
        DebugMapCell cell;
        cell.pos = pos;
        cell.top_id = state->map[pos].top.id;
        cell.top_state = state->map[pos].top.state;
        cell.bottom_id = state->map[pos].bot.id;
        cell.bottom_state = state->map[pos].bot.state;
        cells.push_back(cell);
    }

    return cells;
}

unsigned long long hash_creatures(gamestate const* state)
{
    unsigned long long hash = 1469598103934665603ULL;
    std::vector<MapCreatureEntry> creatures = collect_map_creatures(state);

    for (size_t i = 0; i < creatures.size(); ++i) {
        hash_int(&hash, creatures[i].pos);
        hash_byte(&hash, static_cast<unsigned char>(creatures[i].layer));
        hash_byte(&hash, creatures[i].id);
        hash_byte(&hash, creatures[i].dir);
        hash_byte(&hash, creatures[i].state);
    }

    return hash;
}

MapCreatureEntry const* find_chip_creature(std::vector<MapCreatureEntry> const& creatures)
{
    for (size_t i = 0; i < creatures.size(); ++i) {
        if (is_chip_like(creatures[i].id))
            return &creatures[i];
    }
    return NULL;
}

void print_hash_json(unsigned long long hash)
{
    char buf[17];
    std::snprintf(buf, sizeof buf, "%016llx", hash);
    print_json_string(buf);
}

void print_position_json(int pos)
{
    int x = pos >= 0 ? pos % CXGRID : -1;
    int y = pos >= 0 ? pos / CXGRID : -1;
    std::printf("{\"x\":%d,\"y\":%d,\"pos\":%d}", x, y, pos);
}

void print_random_state_json(gamestate const* state)
{
    std::printf("{\"main\":{\"initial\":");
    print_unsigned_long_json(state->mainprng.initial);
    std::printf(",\"value\":");
    print_unsigned_long_json(state->mainprng.value);
    std::printf(",\"shared\":%s},\"lynx\":{\"prng1\":%u,\"prng2\":%u}}",
                state->mainprng.shared ? "true" : "false",
                static_cast<unsigned int>(state->lxstate.prng1),
                static_cast<unsigned int>(state->lxstate.prng2));
}

void print_inventory_json(gamestate const* state)
{
    std::printf("{\"keys\":[%d,%d,%d,%d],\"boots\":[%d,%d,%d,%d]}",
                state->keys[0], state->keys[1], state->keys[2], state->keys[3],
                state->boots[0], state->boots[1], state->boots[2], state->boots[3]);
}

void print_creature_json(MapCreatureEntry const& cr)
{
    std::printf("{\"id\":%d,\"layer\":%d,\"dir\":", cr.id, cr.layer);
    std::string dir = direction_name(cr.dir);
    print_json_string(dir.c_str());
    std::printf(",\"position\":");
    print_position_json(cr.pos);
    std::printf(",\"state\":%d", cr.state);
    std::printf("}");
}

void print_creatures_json(gamestate const* state)
{
    std::vector<MapCreatureEntry> creatures = collect_map_creatures(state);

    std::printf("[");
    for (size_t i = 0; i < creatures.size(); ++i) {
        if (i)
            std::printf(",");
        print_creature_json(creatures[i]);
    }
    std::printf("]");
}

void print_active_creature_json(creature const* cr, int index)
{
    std::printf("{\"index\":%d,\"id\":%u,\"dir\":", index, static_cast<unsigned int>(cr->id));
    std::string dir = direction_name(cr->dir);
    print_json_string(dir.c_str());
    std::printf(",\"position\":");
    print_position_json(cr->pos);
    std::printf(",\"hidden\":%s,\"state\":%u,\"tdir\":", cr->hidden ? "true" : "false",
                static_cast<unsigned int>(cr->state));
    std::string target_dir = direction_name(cr->tdir);
    print_json_string(target_dir.c_str());
    std::printf(",\"moving\":%d,\"frame\":%d}", static_cast<int>(cr->moving),
                static_cast<int>(cr->frame));
}

void print_active_creatures_json(gamestate const* state)
{
    std::printf("[");
    if (state->ruleset == Ruleset_MS) {
        int count = mslogicoraclecreaturecount();
        creature* const* list = mslogicoraclecreatures();
        for (int i = 0; i < count; ++i) {
            if (i)
                std::printf(",");
            print_active_creature_json(list[i], i);
        }
    } else if (state->ruleset == Ruleset_Lynx && state->creatures) {
        int index = 0;
        for (creature const* cr = state->creatures; cr->id != Nothing; ++cr) {
            if (cr->id == Block)
                continue;
            if (index)
                std::printf(",");
            print_active_creature_json(cr, index++);
        }
    }
    std::printf("]");
}

RuntimeCreatureEntry capture_runtime_creature(creature const* cr, int index)
{
    RuntimeCreatureEntry entry = {0};
    entry.index = index;
    entry.pos = cr ? cr->pos : -1;
    entry.id = cr ? cr->id : Nothing;
    entry.dir = cr ? cr->dir : NIL;
    entry.moving = cr ? cr->moving : 0;
    entry.frame = cr ? cr->frame : 0;
    entry.hidden = cr ? cr->hidden : FALSE;
    entry.state = cr ? cr->state : 0;
    entry.tdir = cr ? cr->tdir : NIL;
    entry.floor_id = Empty;
    entry.floor_state = 0;
    entry.floor_dir = NIL;
    entry.floor_mode = "none";
    return entry;
}

std::vector<RuntimeCreatureEntry> capture_active_creatures(gamestate const* state)
{
    std::vector<RuntimeCreatureEntry> creatures;
    if (state->ruleset == Ruleset_MS) {
        int count = mslogicoraclecreaturecount();
        creature* const* list = mslogicoraclecreatures();
        creatures.reserve(count);
        for (int i = 0; i < count; ++i)
            creatures.push_back(capture_runtime_creature(list[i], i));
    } else if (state->ruleset == Ruleset_Lynx && state->creatures) {
        for (creature const* cr = state->creatures; cr->id != Nothing; ++cr) {
            if (cr->id == Block)
                continue;
            creatures.push_back(capture_runtime_creature(cr, static_cast<int>(creatures.size())));
        }
    }
    return creatures;
}

std::vector<RuntimeCreatureEntry> capture_active_blocks(gamestate const* state)
{
    std::vector<RuntimeCreatureEntry> blocks;
    if (state->ruleset == Ruleset_MS) {
        int count = mslogicoracleblockcount();
        creature* const* list = mslogicoracleblocks();
        blocks.reserve(count);
        for (int i = 0; i < count; ++i)
            blocks.push_back(capture_runtime_creature(list[i], i));
    } else if (state->ruleset == Ruleset_Lynx && state->creatures) {
        for (creature const* cr = state->creatures; cr->id != Nothing; ++cr) {
            if (cr->id != Block)
                continue;
            blocks.push_back(capture_runtime_creature(cr, static_cast<int>(blocks.size())));
        }
    }
    return blocks;
}

int floor_id_at(gamestate const* state, int pos)
{
    mapcell const* cell = state->map + pos;
    if (!iskey(cell->top.id) && !isboots(cell->top.id) && !iscreature(cell->top.id))
        return cell->top.id;
    if (!iskey(cell->bot.id) && !isboots(cell->bot.id) && !iscreature(cell->bot.id))
        return cell->bot.id;
    return Empty;
}

maptile const* floor_tile_at(gamestate const* state, int pos)
{
    mapcell const* cell = state->map + pos;
    if (!iskey(cell->top.id) && !isboots(cell->top.id) && !iscreature(cell->top.id))
        return &cell->top;
    if (!iskey(cell->bot.id) && !isboots(cell->bot.id) && !iscreature(cell->bot.id))
        return &cell->bot;
    return &cell->bot;
}

std::vector<BoardFlagEntry> capture_board_flags(gamestate const* state)
{
    std::vector<BoardFlagEntry> flags;
    flags.reserve(32);
    for (int pos = 0; pos < CXGRID * CYGRID; ++pos) {
        if (state->map[pos].top.state)
            flags.push_back({pos, 1, state->map[pos].top.id, state->map[pos].top.state});
        if (state->map[pos].bot.state)
            flags.push_back({pos, 0, state->map[pos].bot.id, state->map[pos].bot.state});
    }
    return flags;
}

int find_runtime_creature_index(std::vector<RuntimeCreatureEntry> const& entries,
                                creature const* cr)
{
    if (!cr)
        return -1;
    for (size_t i = 0; i < entries.size(); ++i)
        if (entries[i].pos == cr->pos && entries[i].id == cr->id
            && entries[i].dir == cr->dir && entries[i].state == cr->state
            && entries[i].tdir == cr->tdir && entries[i].hidden == cr->hidden
            && entries[i].moving == cr->moving && entries[i].frame == cr->frame)
            return static_cast<int>(i);
    return -1;
}

std::vector<SlipRuntimeEntry> capture_slip_list(gamestate const* state,
                                                std::vector<RuntimeCreatureEntry> const& creatures,
                                                std::vector<RuntimeCreatureEntry> const& blocks)
{
    std::vector<SlipRuntimeEntry> slips;
    if (state->ruleset != Ruleset_MS)
        return slips;

    int count = mslogicoracleslipcount();
    slips.reserve(count);
    for (int i = 0; i < count; ++i) {
        creature const* cr = mslogicoracleslipcreature(i);
        RuntimeCreatureEntry runtime = capture_runtime_creature(cr, i);
        slips.push_back({
            i,
            find_runtime_creature_index(creatures, cr),
            find_runtime_creature_index(blocks, cr),
            mslogicoracleslipdir(i),
            runtime,
        });
    }
    return slips;
}

int slip_direction_for_position(std::vector<SlipRuntimeEntry> const& slips, int pos, unsigned char id)
{
    for (size_t i = 0; i < slips.size(); ++i) {
        if (slips[i].creature.pos == pos && slips[i].creature.id == id)
            return slips[i].dir;
    }
    return NIL;
}

std::string floor_movement_mode(unsigned char state_flags, int floor_id)
{
    if (state_flags & ORACLE_CS_SLIDE)
        return "slide";
    if (!(state_flags & ORACLE_CS_SLIP))
        return "none";
    if (isice(floor_id))
        return "ice";
    if (isslide(floor_id))
        return "slide";
    if (floor_id == Teleport)
        return "teleport";
    if (floor_id == Beartrap)
        return "beartrap";
    if (floor_id == Block_Static)
        return "block";
    return "slip";
}

void annotate_floor_movement(std::vector<RuntimeCreatureEntry>* entries,
                             gamestate const* state,
                             std::vector<SlipRuntimeEntry> const& slips)
{
    for (size_t i = 0; i < entries->size(); ++i) {
        RuntimeCreatureEntry& entry = (*entries)[i];
        if (entry.hidden || entry.pos < 0 || entry.pos >= CXGRID * CYGRID)
            continue;
        maptile const* floor = floor_tile_at(state, entry.pos);
        entry.floor_id = floor->id;
        entry.floor_state = floor->state;
        entry.floor_dir = slip_direction_for_position(slips, entry.pos, entry.id);
        entry.floor_mode = floor_movement_mode(entry.state, floor->id);
    }
}

DebugPhaseSnapshot capture_debug_phase_snapshot(char const* phase, gamestate const* state)
{
    DebugPhaseSnapshot snapshot;
    std::vector<RuntimeCreatureEntry> active_creatures = capture_active_creatures(state);
    std::vector<RuntimeCreatureEntry> active_blocks = capture_active_blocks(state);
    std::vector<SlipRuntimeEntry> slips = capture_slip_list(state, active_creatures, active_blocks);
    maptile const* chip_floor = NULL;
    RuntimeCreatureEntry chip = capture_runtime_creature(NULL, -1);
    bool found_chip = false;

    snapshot.phase = phase ? phase : "";
    snapshot.tick = g_current_tick;
    snapshot.current_time = state->currenttime;
    snapshot.replay_cursor = state->replay;
    snapshot.current_input = state->currentinput;
    snapshot.last_move = state->lastmove;
    snapshot.status_flags = state->statusflags;
    snapshot.chips_needed = state->chipsneeded;
    snapshot.chip_wait = state->msstate.chipwait;
    snapshot.chip_status = state->msstate.chipstatus;
    snapshot.controller_dir = state->msstate.controllerdir;
    snapshot.last_slip_dir = state->msstate.lastslipdir;
    snapshot.goal_pos = state->msstate.goalpos;
    snapshot.completed = state->msstate.completed;
    snapshot.mscc_slippers = state->ruleset == Ruleset_MS ? mslogicoraclemsccslippers() : 0;
    snapshot.sound_effects = state->soundeffects;
    snapshot.map_hash = hash_map(state);
    snapshot.creatures_hash = hash_creatures(state);

    annotate_floor_movement(&active_creatures, state, slips);
    annotate_floor_movement(&active_blocks, state, slips);
    for (size_t i = 0; i < slips.size(); ++i) {
        if (slips[i].creature_index >= 0)
            slips[i].creature = active_creatures[slips[i].creature_index];
        else if (slips[i].block_index >= 0)
            slips[i].creature = active_blocks[slips[i].block_index];
    }

    snapshot.active_creatures = active_creatures;
    snapshot.blocks = active_blocks;
    snapshot.slip_list = slips;
    snapshot.board_flags = capture_board_flags(state);
    snapshot.map_cells = capture_map_cells(state);

    for (size_t i = 0; i < active_creatures.size(); ++i) {
        unsigned char base = creatureid(active_creatures[i].id);
        if (base == Chip || base == Swimming_Chip || base == Pushing_Chip) {
            chip = active_creatures[i];
            found_chip = true;
            break;
        }
    }

    if (found_chip && chip.pos >= 0 && chip.pos < CXGRID * CYGRID) {
        chip_floor = floor_tile_at(state, chip.pos);
        snapshot.chip_floor_id = chip_floor->id;
        snapshot.chip_floor_state = chip_floor->state;
        snapshot.chip_floor_dir = slip_direction_for_position(slips, chip.pos, chip.id);
        snapshot.chip_floor_mode = floor_movement_mode(chip.state, chip_floor->id);
    } else {
        snapshot.chip_floor_id = Empty;
        snapshot.chip_floor_state = 0;
        snapshot.chip_floor_dir = NIL;
        snapshot.chip_floor_mode = "none";
    }

    return snapshot;
}

extern "C" void oracle_record_debug_phase(char const* phase, gamestate const* state)
{
    if (!g_debug_phase_sink || !state)
        return;
    g_debug_phase_sink->push_back(capture_debug_phase_snapshot(phase, state));
}

void print_chip_json(gamestate const* state)
{
    std::vector<MapCreatureEntry> creatures = collect_map_creatures(state);
    MapCreatureEntry const* chip = find_chip_creature(creatures);
    if (!chip) {
        int x = (state->xviewpos + 4) / 8;
        int y = (state->yviewpos + 4) / 8;
        int pos = y * CXGRID + x;
        std::printf("{\"id\":-1,\"layer\":-1,\"dir\":\"none\",\"position\":");
        print_position_json(pos);
        std::printf(",\"state\":0,\"source\":\"view\"}");
        return;
    }
    print_creature_json(*chip);
}

void print_creature_state_flags_json(unsigned char state)
{
    bool first = true;
    auto emit = [&](char const* flag) {
        if (!first)
            std::printf(",");
        print_json_string(flag);
        first = false;
    };

    std::printf("[");
    if (state & ORACLE_CS_RELEASED) emit("released");
    if (state & ORACLE_CS_CLONING) emit("cloning");
    if (state & ORACLE_CS_HASMOVED) emit("has-moved");
    if (state & ORACLE_CS_TURNING) emit("turning");
    if (state & ORACLE_CS_SLIP) emit("slip");
    if (state & ORACLE_CS_SLIDE) emit("slide");
    if (state & ORACLE_CS_DEFERPUSH) emit("defer-push");
    if (state & ORACLE_CS_MUTANT) emit("mutant");
    std::printf("]");
}

void print_floor_state_flags_json(unsigned char state)
{
    bool first = true;
    auto emit = [&](char const* flag) {
        if (!first)
            std::printf(",");
        print_json_string(flag);
        first = false;
    };

    std::printf("[");
    if (state & ORACLE_FS_BUTTONDOWN) emit("button-down");
    if (state & ORACLE_FS_CLONING) emit("cloning");
    if (state & ORACLE_FS_BROKEN) emit("broken");
    if (state & ORACLE_FS_HASMUTANT) emit("has-mutant");
    if (state & ORACLE_FS_MARKER) emit("marker");
    std::printf("]");
}

void print_runtime_creature_json(RuntimeCreatureEntry const& cr)
{
    std::printf("{\"index\":%d,\"id\":%u,\"dir\":", cr.index, static_cast<unsigned int>(cr.id));
    std::string dir = direction_name(cr.dir);
    print_json_string(dir.c_str());
    std::printf(",\"position\":");
    print_position_json(cr.pos);
    std::printf(",\"hidden\":%s,\"state\":%u,\"stateFlags\":", cr.hidden ? "true" : "false",
                static_cast<unsigned int>(cr.state));
    print_creature_state_flags_json(cr.state);
    std::printf(",\"tdir\":");
    std::string tdir = direction_name(cr.tdir);
    print_json_string(tdir.c_str());
    std::printf(",\"floor\":{\"id\":%d,\"state\":%u,\"stateFlags\":", cr.floor_id,
                static_cast<unsigned int>(cr.floor_state));
    print_floor_state_flags_json(cr.floor_state);
    std::printf(",\"movementMode\":");
    print_json_string(cr.floor_mode.c_str());
    std::printf(",\"slipDir\":");
    std::string floor_dir = direction_name(cr.floor_dir);
    print_json_string(floor_dir.c_str());
    std::printf("},\"moving\":%d,\"frame\":%d", static_cast<int>(cr.moving),
                static_cast<int>(cr.frame));
    std::printf("}");
}

void print_runtime_creatures_json(std::vector<RuntimeCreatureEntry> const& creatures)
{
    std::printf("[");
    for (size_t i = 0; i < creatures.size(); ++i) {
        if (i)
            std::printf(",");
        print_runtime_creature_json(creatures[i]);
    }
    std::printf("]");
}

void print_slip_list_json(std::vector<SlipRuntimeEntry> const& slips)
{
    std::printf("[");
    for (size_t i = 0; i < slips.size(); ++i) {
        if (i)
            std::printf(",");
        std::printf("{\"index\":%d,\"dir\":", slips[i].index);
        std::string dir = direction_name(slips[i].dir);
        print_json_string(dir.c_str());
        std::printf(",\"creatureIndex\":%d,\"blockIndex\":%d,\"creature\":",
                    slips[i].creature_index, slips[i].block_index);
        print_runtime_creature_json(slips[i].creature);
        std::printf("}");
    }
    std::printf("]");
}

void print_board_flags_json(std::vector<BoardFlagEntry> const& flags)
{
    std::printf("[");
    for (size_t i = 0; i < flags.size(); ++i) {
        if (i)
            std::printf(",");
        std::printf("{\"layer\":%d,\"id\":%u,\"position\":", flags[i].layer,
                    static_cast<unsigned int>(flags[i].id));
        print_position_json(flags[i].pos);
        std::printf(",\"state\":%u,\"stateFlags\":", static_cast<unsigned int>(flags[i].state));
        print_floor_state_flags_json(flags[i].state);
        std::printf("}");
    }
    std::printf("]");
}

void print_debug_map_cells_json(std::vector<DebugMapCell> const& cells)
{
    std::printf("[");
    for (size_t i = 0; i < cells.size(); ++i) {
        if (i)
            std::printf(",");
        std::printf("{\"position\":");
        print_position_json(cells[i].pos);
        std::printf(",\"top\":{\"id\":%u,\"state\":%u},\"bottom\":{\"id\":%u,\"state\":%u}}",
                    static_cast<unsigned int>(cells[i].top_id),
                    static_cast<unsigned int>(cells[i].top_state),
                    static_cast<unsigned int>(cells[i].bottom_id),
                    static_cast<unsigned int>(cells[i].bottom_state));
    }
    std::printf("]");
}

void print_debug_phase_snapshot_json(DebugPhaseSnapshot const& snapshot)
{
    std::printf("{\"phase\":");
    print_json_string(snapshot.phase.c_str());
    std::printf(",\"tick\":%d,\"currentTime\":%d,\"replayCursor\":%d,"
                "\"currentInputCode\":%d,\"currentInput\":",
                snapshot.tick, snapshot.current_time, snapshot.replay_cursor,
                snapshot.current_input);
    std::string current_input = command_name(snapshot.current_input);
    print_json_string(current_input.c_str());
    std::printf(",\"lastMoveCode\":%d,\"lastMove\":", snapshot.last_move);
    std::string last_move = command_name(snapshot.last_move);
    print_json_string(last_move.c_str());
    std::printf(",\"chipsNeeded\":%d,\"statusFlags\":%d,\"chipStatus\":",
                snapshot.chips_needed, snapshot.status_flags);
    print_json_string(chip_status_name(snapshot.chip_status));
    std::printf(",\"chipStatusCode\":%d,\"chipWait\":%d,\"controllerDir\":",
                snapshot.chip_status, snapshot.chip_wait);
    std::string controller_dir = direction_name(snapshot.controller_dir);
    print_json_string(controller_dir.c_str());
    std::printf(",\"lastSlipDir\":");
    std::string last_slip_dir = direction_name(snapshot.last_slip_dir);
    print_json_string(last_slip_dir.c_str());
    std::printf(",\"goalPos\":%d,\"completed\":%s,\"msccSlippers\":%d,"
                "\"soundEffects\":%lu,\"chipFloor\":{\"id\":%d,\"state\":%u,"
                "\"stateFlags\":",
                snapshot.goal_pos, snapshot.completed ? "true" : "false",
                snapshot.mscc_slippers, snapshot.sound_effects,
                snapshot.chip_floor_id, static_cast<unsigned int>(snapshot.chip_floor_state));
    print_floor_state_flags_json(snapshot.chip_floor_state);
    std::printf(",\"movementMode\":");
    print_json_string(snapshot.chip_floor_mode.c_str());
    std::printf(",\"slipDir\":");
    std::string chip_floor_dir = direction_name(snapshot.chip_floor_dir);
    print_json_string(chip_floor_dir.c_str());
    std::printf("},\"mapHash\":");
    print_hash_json(snapshot.map_hash);
    std::printf(",\"creaturesHash\":");
    print_hash_json(snapshot.creatures_hash);
    std::printf(",\"activeCreatures\":");
    print_runtime_creatures_json(snapshot.active_creatures);
    std::printf(",\"blocks\":");
    print_runtime_creatures_json(snapshot.blocks);
    std::printf(",\"slipList\":");
    print_slip_list_json(snapshot.slip_list);
    std::printf(",\"boardFlags\":");
    print_board_flags_json(snapshot.board_flags);
    std::printf(",\"map\":{\"cells\":");
    print_debug_map_cells_json(snapshot.map_cells);
    std::printf("}");
    std::printf("}");
}

void print_snapshot_fields_json(gamestate const* state, int tick,
                                int input_cmd, int outcome, char const* phase)
{
    std::vector<MapCreatureEntry> creatures = collect_map_creatures(state);

    std::printf("\"phase\":");
    print_json_string(phase);
    std::printf(",\"tick\":%d,\"status\":", tick);
    print_json_string(trace_status_name(outcome));
    std::printf(",\"input\":");
    std::string input_name = command_name(input_cmd);
    print_json_string(input_name.c_str());
    std::printf(",\"inputCode\":%d", input_cmd);
    std::printf(",\"replayCursor\":%d", state->replay);
    std::printf(",\"currentTime\":%d,\"timeOffset\":%d,\"secondsPlayed\":%d,"
                "\"timelimit\":%d,\"chipsNeeded\":%d,\"statusFlags\":%d,"
                "\"lastMoveCode\":%d,\"lastMove\":",
                state->currenttime, state->timeoffset, secondsplayed(),
                state->timelimit, state->chipsneeded, state->statusflags,
                state->lastmove);
    std::string last_move = command_name(state->lastmove);
    print_json_string(last_move.c_str());
    std::printf(",\"stepping\":%d,\"initRandomSlideDir\":", state->stepping);
    std::string init_dir = direction_name(state->initrndslidedir);
    print_json_string(init_dir.c_str());
    std::printf(",\"randomState\":");
    print_random_state_json(state);
    std::printf(",\"soundEffects\":%lu,\"view\":{\"x\":%d,\"y\":%d},"
                "\"inventory\":",
                state->soundeffects, state->xviewpos, state->yviewpos);
    print_inventory_json(state);
    std::printf(",\"chip\":");
    print_chip_json(state);
    std::printf(",\"creatureCount\":%zu,\"creaturesHash\":", creatures.size());
    print_hash_json(hash_creatures(state));
    std::printf(",\"mapHash\":");
    print_hash_json(hash_map(state));
    std::printf(",\"creatures\":");
    std::printf("[");
    for (size_t i = 0; i < creatures.size(); ++i) {
        if (i)
            std::printf(",");
        print_creature_json(creatures[i]);
    }
    std::printf("]");
    if (debug_active_creatures_enabled()) {
        std::printf(",\"activeCreatures\":");
        print_active_creatures_json(state);
    }
}

void print_snapshot_json(gamestate const* state, int tick,
                         int input_cmd, int outcome, char const* phase)
{
    std::printf("{");
    print_snapshot_fields_json(state, tick, input_cmd, outcome, phase);
    std::printf("}");
}

std::string normalize_token(char const* text)
{
    std::string token = text ? text : "";
    for (size_t i = 0; i < token.size(); ++i)
        token[i] = static_cast<char>(std::tolower(static_cast<unsigned char>(token[i])));
    return token;
}

int parse_trace_command(char const* text, int* cmd)
{
    std::string token = normalize_token(text);

    if (token.empty() || token == "-" || token == "none") {
        *cmd = CmdNone;
        return TRUE;
    }
    if (token == "preserve" || token == "hold") {
        *cmd = CmdPreserve;
        return TRUE;
    }
    if (token == "n" || token == "north" || token == "up") {
        *cmd = CmdNorth;
        return TRUE;
    }
    if (token == "w" || token == "west" || token == "left") {
        *cmd = CmdWest;
        return TRUE;
    }
    if (token == "s" || token == "south" || token == "down") {
        *cmd = CmdSouth;
        return TRUE;
    }
    if (token == "e" || token == "east" || token == "right") {
        *cmd = CmdEast;
        return TRUE;
    }
    return FALSE;
}

int parse_input_spec(char const* spec, std::vector<ScheduledInput>* out)
{
    std::string text = spec ? spec : "";
    size_t start = 0;

    out->clear();
    if (text.empty() || text == "-")
        return TRUE;

    while (start < text.size()) {
        size_t end = text.find(',', start);
        std::string token = text.substr(start, end == std::string::npos ? std::string::npos : end - start);
        size_t colon = token.find(':');
        if (colon == std::string::npos)
            return FALSE;

        std::string tick_text = token.substr(0, colon);
        std::string cmd_text = token.substr(colon + 1);
        char* tail = NULL;
        long tick = std::strtol(tick_text.c_str(), &tail, 10);
        int cmd = CmdNone;

        if (!tail || *tail != '\0' || tick < 0 || !parse_trace_command(cmd_text.c_str(), &cmd))
            return FALSE;

        out->push_back({static_cast<int>(tick), cmd});
        if (end == std::string::npos)
            break;
        start = end + 1;
    }

    std::sort(out->begin(), out->end(),
              [](ScheduledInput const& lhs, ScheduledInput const& rhs) {
                  if (lhs.tick != rhs.tick)
                      return lhs.tick < rhs.tick;
                  return lhs.cmd < rhs.cmd;
              });
    return TRUE;
}

int scheduled_input_for_tick(std::vector<ScheduledInput> const& inputs,
                             size_t* next_index, int tick)
{
    int cmd = CmdNone;

    while (*next_index < inputs.size() && inputs[*next_index].tick == tick) {
        cmd = inputs[*next_index].cmd;
        ++(*next_index);
    }

    return cmd;
}

int planned_replay_input(gamestate const* state, int tick)
{
    if (!state || state->replay < 0 || state->replay >= state->moves.count)
        return CmdNone;
    if (tick != static_cast<int>(state->moves.list[state->replay].when))
        return CmdNone;
    return state->moves.list[state->replay].dir;
}

int default_input_trace_ticks(std::vector<ScheduledInput> const& inputs)
{
    return inputs.empty() ? 80 : std::max(inputs.back().tick + 20, 80);
}

int default_replay_trace_ticks(gamesetup const* game)
{
    if (game->besttime != TIME_NIL)
        return game->besttime + 40;
    if (game->time > 0)
        return game->time * TICKS_PER_SECOND + 40;
    return 400;
}

int parse_ruleset_spec(char const* text, int* ruleset)
{
    std::string token = normalize_token(text);

    if (token == "lynx") {
        *ruleset = Ruleset_Lynx;
        return TRUE;
    }
    if (token == "ms") {
        *ruleset = Ruleset_MS;
        return TRUE;
    }
    return FALSE;
}

int parse_solution_moves(char const* spec, std::vector<action>* out)
{
    std::string text = spec ? spec : "";
    size_t start = 0;

    out->clear();
    if (text.empty() || text == "-")
        return TRUE;

    while (start < text.size()) {
        size_t end = text.find(',', start);
        std::string token = text.substr(start, end == std::string::npos ? std::string::npos : end - start);
        size_t colon = token.find(':');
        if (colon == std::string::npos)
            return FALSE;

        char* tail = NULL;
        long when = std::strtol(token.substr(0, colon).c_str(), &tail, 10);
        if (!tail || *tail != '\0' || when < 0)
            return FALSE;

        tail = NULL;
        long dir = std::strtol(token.substr(colon + 1).c_str(), &tail, 10);
        if (!tail || *tail != '\0' || dir < 0 || dir > CmdReservedLast)
            return FALSE;

        action move = {0};
        move.when = static_cast<unsigned int>(when);
        move.dir = static_cast<unsigned int>(dir);
        out->push_back(move);

        if (end == std::string::npos)
            break;
        start = end + 1;
    }

    return TRUE;
}

int assign_solution_data(gamesetup* game, int best_time,
                         unsigned long flags,
                         unsigned long random_slide_dir,
                         int stepping,
                         unsigned long random_seed,
                         std::vector<action> const& moves)
{
    solutioninfo source = {0};
    int ok = FALSE;

    if (!game)
        return FALSE;

    initmovelist(&source.moves);
    for (size_t i = 0; i < moves.size(); ++i)
        addtomovelist(&source.moves, moves[i]);
    source.flags = flags;
    source.rndslidedir = static_cast<unsigned char>(random_slide_dir);
    source.stepping = static_cast<signed char>(stepping);
    source.rndseed = random_seed;

    std::free(game->solutiondata);
    game->solutiondata = NULL;
    game->solutionsize = 0;
    game->besttime = best_time;

    ok = contractsolution(&source, game);
    destroymovelist(&source.moves);
    return ok;
}

std::string hex_encode(unsigned char const* data, size_t size)
{
    static char const digits[] = "0123456789abcdef";
    std::string out;
    out.reserve(size * 2);

    for (size_t i = 0; i < size; ++i) {
        unsigned char value = data[i];
        out.push_back(digits[(value >> 4) & 0x0F]);
        out.push_back(digits[value & 0x0F]);
    }

    return out;
}

void print_moves_json(actlist const& moves)
{
    std::printf("[");
    for (int i = 0; i < moves.count; ++i) {
        if (i)
            std::printf(",");
        std::printf("{\"when\":%u,\"dir\":%u}",
                    moves.list[i].when, moves.list[i].dir);
    }
    std::printf("]");
}

void print_solutioninfo_json(solutioninfo const& solution)
{
    std::printf("{\"flags\":%lu,\"randomSlideDirection\":%u,"
                "\"stepping\":%d,\"randomSeed\":%lu,\"moves\":",
                solution.flags,
                static_cast<unsigned int>(solution.rndslidedir),
                static_cast<int>(solution.stepping),
                solution.rndseed);
    print_moves_json(solution.moves);
    std::printf("}");
}

void init_roundtrip_series(gameseries* series, int ruleset, char const* savefilename)
{
    std::memset(series, 0, sizeof *series);
    series->count = 1;
    series->allocated = 1;
    series->ruleset = ruleset;
    std::snprintf(series->filebase, sizeof series->filebase, "oracle-roundtrip.dac");
    std::snprintf(series->name, sizeof series->name, "oracle-roundtrip.dac");
    series->games = static_cast<gamesetup*>(std::calloc(1, sizeof *series->games));
    if (!series->games)
        memerrexit();
    series->savefilename = ScopedDirs::dup(savefilename);
    clearfileinfo(&series->savefile);
}

void clear_roundtrip_series(gameseries* series)
{
    if (!series)
        return;
    clearsolutions(series);
    std::free(series->games);
    series->games = NULL;
    std::free(series->savefilename);
    series->savefilename = NULL;
    clearfileinfo(&series->savefile);
}

int run_trace(char const* command_name_text, gameseries const* series,
              gamesetup* game, int level_index,
              std::vector<ScheduledInput> const* scheduled_inputs,
              int max_ticks, int playback,
              int has_random_seed, unsigned long random_seed,
              TraceOptions const& trace_options)
{
    int outcome = 0;
    int step_count = 0;
    size_t next_input_index = 0;
    bool printed_step = false;
    gamestate* current_state = NULL;
    std::vector<DebugPhaseSnapshot> debug_phases;

    batchmode = TRUE;
    g_current_tick = 0;
    settimer(-1);

    if (!initgamestate(game, series->ruleset)) {
        std::fprintf(stderr, "unable to initialize game state for %s level %d\n",
                     series->name, game->number);
        return 1;
    }
    current_state = const_cast<gamestate*>(currentgamestate());
    if (!playback && has_random_seed)
        restartprng(&current_state->mainprng, random_seed);
    if (playback && !prepareplayback()) {
        std::fprintf(stderr, "no replay is available for %s level %d\n",
                     series->name, game->number);
        endgamestate();
        return 1;
    }

    if (trace_options.debug) {
        g_debug_phase_sink = &debug_phases;
        tworldoraclesetphasecallback(oracle_record_debug_phase);
    }

    std::printf("{\"command\":");
    print_json_string(command_name_text);
    std::printf(",\"series\":");
    print_json_string(series->name);
    std::printf(",\"levelNumber\":%d,\"levelIndex\":%d,\"ruleset\":",
                game->number, level_index);
    print_json_string(ruleset_name(series->ruleset));
    std::printf(",\"maxTicks\":%d,\"timerSecondMs\":%d", max_ticks, g_timer_second_ms);
    std::printf(",\"randomSeed\":");
    print_unsigned_long_json(currentgamestate()->mainprng.initial);
    if (trace_options.debug)
        std::printf(",\"debugSchemaVersion\":%d", trace_options.debug_schema_version);
    if (trace_options.has_step_window) {
        std::printf(",\"stepWindowStart\":%d,\"stepWindowEndExclusive\":%d",
                    trace_options.step_window_start,
                    trace_options.step_window_end_exclusive);
    }

    if (scheduled_inputs) {
        std::printf(",\"scheduledInputs\":[");
        for (size_t i = 0; i < scheduled_inputs->size(); ++i) {
            if (i)
                std::printf(",");
            std::printf("{\"tick\":%d,\"input\":",
                        (*scheduled_inputs)[i].tick);
            std::string name = command_name((*scheduled_inputs)[i].cmd);
            print_json_string(name.c_str());
            std::printf(",\"inputCode\":%d}", (*scheduled_inputs)[i].cmd);
        }
        std::printf("]");
    }

    std::printf(",\"initialState\":");
    print_snapshot_json(currentgamestate(), -1, CmdNone, 0, "initial");
    if (trace_options.debug) {
        std::printf(",\"initialDebugState\":");
        print_debug_phase_snapshot_json(capture_debug_phase_snapshot("initial", currentgamestate()));
    }
    std::printf(",\"steps\":[");

    for (int step = 0; step < max_ticks; ++step) {
        int input_cmd = playback
            ? planned_replay_input(currentgamestate(), g_current_tick)
            : scheduled_input_for_tick(*scheduled_inputs, &next_input_index, g_current_tick);
        bool include_step = !trace_options.has_step_window
            || (step >= trace_options.step_window_start
                && step < trace_options.step_window_end_exclusive);

        debug_phases.clear();
        outcome = doturn(playback ? CmdNone : input_cmd);
        if (include_step) {
            if (printed_step)
                std::printf(",");
            std::printf("{");
            print_snapshot_fields_json(currentgamestate(), g_current_tick, input_cmd, outcome, "tick");
            if (trace_options.debug) {
                std::printf(",\"phases\":[");
                for (size_t i = 0; i < debug_phases.size(); ++i) {
                    if (i)
                        std::printf(",");
                    print_debug_phase_snapshot_json(debug_phases[i]);
                }
                std::printf("]");
            }
            std::printf("}");
            printed_step = true;
        }
        ++step_count;

        if (outcome != 0)
            break;

        advancetick();
    }

    std::printf("],\"result\":{\"status\":");
    print_json_string(trace_status_name(outcome));
    std::printf(",\"finalTick\":%d,\"stepCount\":%d}}\n",
                currentgamestate()->currenttime, step_count);

    tworldoraclesetphasecallback(NULL);
    g_debug_phase_sink = NULL;
    quitgamestate();
    endgamestate();
    shutdowngamestate();
    return 0;
}

TraceOptions canonical_trace_options()
{
    return TraceOptions{};
}

TraceOptions debug_trace_options()
{
    TraceOptions options;
    options.debug = true;
    options.debug_schema_version = 2;
    return options;
}

void print_usage()
{
    std::fprintf(stderr,
                 "usage:\n"
                 "  tworld-oracle [--root DIR] [--series-dir DIR] [--data-dir DIR]\n"
                 "                [--save-dir DIR] [--res-dir DIR] <command> [args]\n"
                 "commands:\n"
                 "  series-list [preferred]\n"
                 "  level-info <series-file> [level-number]\n"
                 "  score-table <series-file>\n"
                 "  times-table <series-file>\n"
                 "  solution-list <series-file>\n"
                 "  solution-roundtrip <ruleset> <level-number> <password> <best-time>\n"
                 "                    <flags> <random-slide-dir> <stepping> <random-seed>\n"
                 "                    [when:dir,...]\n"
                 "  input-trace <series-file> <level-number> [tick:cmd,...] [max-ticks] [random-seed]\n"
                 "  input-trace-debug <series-file> <level-number> [tick:cmd,...] [max-ticks] [random-seed]\n"
                 "  replay-trace <series-file> <level-number> [max-ticks]\n"
                 "  replay-trace-debug <series-file> <level-number> [max-ticks]\n"
                 "  replay-trace-solution <series-file> <level-number> <max-ticks> <best-time>\n"
                 "                        <flags> <random-slide-dir> <stepping> <random-seed>\n"
                 "                        [when:dir,...]\n"
                 "  replay-trace-solution-debug <series-file> <level-number> <max-ticks> <best-time>\n"
                 "                        <flags> <random-slide-dir> <stepping> <random-seed>\n"
                 "                        [when:dir,...]\n"
                 "  replay-trace-solution-debug-window <series-file> <level-number> <max-ticks>\n"
                 "                        <best-time> <flags> <random-slide-dir> <stepping>\n"
                 "                        <random-seed> <window-start> <window-end-exclusive>\n"
                 "                        [when:dir,...]\n");
}

int command_series_list(int argc, char** argv)
{
    gameseries* list = NULL;
    mapfileinfo* mflist = NULL;
    int count = 0;
    int mfcount = 0;
    char const* preferred = argc >= 3 ? argv[2] : NULL;

    struct SeriesSummary {
        std::string name;
        std::string filebase;
        std::string mapfilename;
        std::string ruleset;
        int level_count;
    };
    std::vector<SeriesSummary> summaries;

    if (!createserieslist(preferred, &list, &count, &mflist, &mfcount, NULL))
        return 1;

    summaries.reserve(count);
    for (int i = 0; i < count; ++i) {
        gameseries const& series = list[i];
        summaries.push_back({
            std::string(series.name),
            std::string(series.filebase),
            series.mapfilename ? std::string(series.mapfilename) : std::string(),
            std::string(ruleset_name(series.ruleset)),
            series.count
        });
    }

    std::sort(summaries.begin(), summaries.end(),
              [](SeriesSummary const& lhs, SeriesSummary const& rhs) {
                  if (lhs.filebase != rhs.filebase)
                      return lhs.filebase < rhs.filebase;
                  if (lhs.ruleset != rhs.ruleset)
                      return lhs.ruleset < rhs.ruleset;
                  return lhs.name < rhs.name;
              });

    std::printf("{\"command\":\"series-list\",\"series\":[");
    for (size_t i = 0; i < summaries.size(); ++i) {
        SeriesSummary const& series = summaries[i];
        if (i)
            std::printf(",");
        std::printf("{\"name\":");
        print_json_string(series.name.c_str());
        std::printf(",\"filebase\":");
        print_json_string(series.filebase.c_str());
        std::printf(",\"mapfilename\":");
        print_json_string(series.mapfilename.c_str());
        std::printf(",\"ruleset\":");
        print_json_string(series.ruleset.c_str());
        std::printf(",\"levelCount\":%d}", series.level_count);
    }

    std::printf("],\"table\":{\"rows\":%zu,\"cols\":2,\"sep\":2,\"collapse\":0,\"data\":[",
                summaries.size() + 1);
    std::printf("[{\"span\":1,\"align\":\"-\",\"text\":\"Filename\"},"
                "{\"span\":1,\"align\":\".\",\"text\":\"Ruleset\"}]");
    for (size_t i = 0; i < summaries.size(); ++i) {
        std::printf(",[{\"span\":1,\"align\":\"-\",\"text\":");
        print_json_string(summaries[i].filebase.c_str());
        std::printf("},{\"span\":1,\"align\":\".\",\"text\":");
        print_json_string(summaries[i].ruleset.c_str());
        std::printf("}]");
    }
    std::printf("]}");
    std::printf("}\n");

    freeserieslist(list, count, mflist, mfcount, NULL);
    return 0;
}

int command_level_info(int argc, char** argv)
{
    gameseries series;
    long level_filter = -1;

    if (argc < 3) {
        print_usage();
        return 2;
    }

    if (!load_single_series(argv[2], &series))
        return 1;

    if (argc >= 4)
        level_filter = std::strtol(argv[3], NULL, 10);

    std::printf("{\"command\":\"level-info\",\"series\":{\"name\":");
    print_json_string(series.name);
    std::printf(",\"filebase\":");
    print_json_string(series.filebase);
    std::printf(",\"ruleset\":");
    print_json_string(ruleset_name(series.ruleset));
    std::printf(",\"levelCount\":%d},\"levels\":[", series.count);

    bool first = true;
    for (int i = 0; i < series.count; ++i) {
        gamesetup const& game = series.games[i];
        if (level_filter >= 0 && game.number != level_filter)
            continue;

        if (!first)
            std::printf(",");
        first = false;

        std::printf("{\"index\":%d,\"number\":%d,\"name\":", i, game.number);
        print_json_string(game.name);
        std::printf(",\"author\":");
        print_json_string(game.author);
        std::printf(",\"password\":");
        print_json_string(game.passwd);
        std::printf(",\"timeLimitSeconds\":%d,\"bestTimeTicks\":%d,"
                    "\"levelSize\":%d,\"solutionSize\":%d,\"levelHash\":",
                    game.time, game.besttime, game.levelsize, game.solutionsize);
        print_unsigned_long_json(game.levelhash);
        std::printf(",\"hasSolution\":%s,\"sgflags\":%d,\"unsolvable\":",
                    hassolution(&game) ? "true" : "false", game.sgflags);
        if (game.unsolvable)
            print_json_string(game.unsolvable);
        else
            std::printf("null");
        std::printf("}");
    }

    std::printf("]}\n");
    freeseriesdata(&series);
    return 0;
}

int command_score_table(int argc, char** argv)
{
    gameseries series;
    int* levellist = NULL;
    int count = 0;
    tablespec table = {0};

    if (argc < 3) {
        print_usage();
        return 2;
    }

    if (!load_single_series(argv[2], &series))
        return 1;
    if (!createscorelist(&series, TRUE, '0', &levellist, &count, &table))
        return 1;

    std::printf("{\"command\":\"score-table\",\"series\":");
    print_json_string(series.name);
    std::printf(",\"rowLevelIndexes\":[");
    for (int i = 0; i < count; ++i) {
        if (i)
            std::printf(",");
        std::printf("%d", levellist[i]);
    }
    std::printf("],\"table\":");
    print_table_json(table);
    std::printf("}\n");

    freescorelist(levellist, &table);
    freeseriesdata(&series);
    return 0;
}

int command_times_table(int argc, char** argv)
{
    gameseries series;
    int* levellist = NULL;
    int count = 0;
    tablespec table = {0};
    int partial = 0;

    if (argc < 3) {
        print_usage();
        return 2;
    }

    if (!load_single_series(argv[2], &series))
        return 1;

    partial = series.ruleset == Ruleset_MS ? 10 : 100;
    if (!createtimelist(&series, partial, '0', &levellist, &count, &table))
        return 1;

    std::printf("{\"command\":\"times-table\",\"series\":");
    print_json_string(series.name);
    std::printf(",\"showPartial\":%d,\"rowLevelIndexes\":[", partial);
    for (int i = 0; i < count; ++i) {
        if (i)
            std::printf(",");
        std::printf("%d", levellist[i]);
    }
    std::printf("],\"table\":");
    print_table_json(table);
    std::printf("}\n");

    freetimelist(levellist, &table);
    freeseriesdata(&series);
    return 0;
}

int command_solution_list(int argc, char** argv)
{
    gameseries series;
    char const** filelist = NULL;
    int count = 0;
    tablespec table = {0};
    std::vector<std::string> files;

    if (argc < 3) {
        print_usage();
        return 2;
    }

    if (!load_single_series(argv[2], &series))
        return 1;

    if (createsolutionfilelist(&series, FALSE, &filelist, &count, &table)) {
        for (int i = 0; i < count; ++i)
            files.push_back(filelist[i]);
        std::sort(files.begin(), files.end());
        freesolutionfilelist(filelist, &table);
    }

    std::printf("{\"command\":\"solution-list\",\"series\":");
    print_json_string(series.name);
    std::printf(",\"files\":[");
    for (size_t i = 0; i < files.size(); ++i) {
        if (i)
            std::printf(",");
        print_json_string(files[i].c_str());
    }
    std::printf("]}\n");

    freeseriesdata(&series);
    return 0;
}

int command_solution_roundtrip(int argc, char** argv)
{
    int ruleset = Ruleset_None;
    int level_number;
    int best_time;
    unsigned long flags;
    unsigned long random_slide_dir;
    int stepping;
    unsigned long random_seed;
    std::vector<action> moves;
    solutioninfo source = {0};
    solutioninfo memory_roundtrip = {0};
    solutioninfo file_roundtrip = {0};
    gamesetup game = {0};
    gameseries save_series = {0};
    gameseries load_series = {0};
    std::string save_filename = join_path(savedir, "oracle-solution-roundtrip.tws");
    bool memory_roundtrip_ok = false;
    bool file_roundtrip_ok = false;
    char* tail = NULL;

    if (argc < 10) {
        print_usage();
        return 2;
    }

    if (!parse_ruleset_spec(argv[2], &ruleset)) {
        std::fprintf(stderr, "invalid ruleset: %s\n", argv[2]);
        return 2;
    }

    level_number = static_cast<int>(std::strtol(argv[3], &tail, 10));
    if (!tail || *tail != '\0' || level_number <= 0) {
        std::fprintf(stderr, "invalid level number: %s\n", argv[3]);
        return 2;
    }

    if (std::strlen(argv[4]) != 4) {
        std::fprintf(stderr, "password must be 4 characters: %s\n", argv[4]);
        return 2;
    }

    best_time = static_cast<int>(std::strtol(argv[5], &tail, 10));
    if (!tail || *tail != '\0' || best_time < 0) {
        std::fprintf(stderr, "invalid best time: %s\n", argv[5]);
        return 2;
    }

    flags = std::strtoul(argv[6], &tail, 10);
    if (!tail || *tail != '\0') {
        std::fprintf(stderr, "invalid flags: %s\n", argv[6]);
        return 2;
    }

    random_slide_dir = std::strtoul(argv[7], &tail, 10);
    if (!tail || *tail != '\0' || random_slide_dir > 255) {
        std::fprintf(stderr, "invalid random slide direction: %s\n", argv[7]);
        return 2;
    }

    stepping = static_cast<int>(std::strtol(argv[8], &tail, 10));
    if (!tail || *tail != '\0' || stepping < 0 || stepping > 7) {
        std::fprintf(stderr, "invalid stepping: %s\n", argv[8]);
        return 2;
    }

    random_seed = std::strtoul(argv[9], &tail, 10);
    if (!tail || *tail != '\0') {
        std::fprintf(stderr, "invalid random seed: %s\n", argv[9]);
        return 2;
    }

    if (!parse_solution_moves(argc >= 11 ? argv[10] : "-", &moves)) {
        std::fprintf(stderr, "invalid move specification: %s\n", argc >= 11 ? argv[10] : "");
        return 2;
    }

    initmovelist(&source.moves);
    for (size_t i = 0; i < moves.size(); ++i)
        addtomovelist(&source.moves, moves[i]);
    source.flags = flags;
    source.rndslidedir = static_cast<unsigned char>(random_slide_dir);
    source.stepping = static_cast<signed char>(stepping);
    source.rndseed = random_seed;

    game.number = level_number;
    std::memcpy(game.passwd, argv[4], 4);
    game.passwd[4] = '\0';
    game.besttime = best_time;
    game.sgflags = SGF_HASPASSWD;

    if (!contractsolution(&source, &game)) {
        destroymovelist(&source.moves);
        return 1;
    }

    memory_roundtrip_ok = expandsolution(&memory_roundtrip, &game) != FALSE;

    std::remove(save_filename.c_str());
    init_roundtrip_series(&save_series, ruleset, save_filename.c_str());
    save_series.games[0] = game;
    game.solutiondata = NULL;
    game.solutionsize = 0;

    if (!savesolutions(&save_series)) {
        clear_roundtrip_series(&save_series);
        if (memory_roundtrip_ok)
            destroymovelist(&memory_roundtrip.moves);
        destroymovelist(&source.moves);
        return 1;
    }

    init_roundtrip_series(&load_series, ruleset, save_filename.c_str());
    load_series.games[0].number = level_number;
    std::memcpy(load_series.games[0].passwd, argv[4], 4);
    load_series.games[0].passwd[4] = '\0';
    if (!readsolutions(&load_series)) {
        clear_roundtrip_series(&load_series);
        clear_roundtrip_series(&save_series);
        if (memory_roundtrip_ok)
            destroymovelist(&memory_roundtrip.moves);
        destroymovelist(&source.moves);
        std::remove(save_filename.c_str());
        return 1;
    }

    if (load_series.games[0].solutionsize > 0)
        file_roundtrip_ok = expandsolution(&file_roundtrip, load_series.games + 0) != FALSE;

    std::printf("{\"command\":\"solution-roundtrip\",\"ruleset\":");
    print_json_string(ruleset_name(ruleset));
    std::printf(",\"levelNumber\":%d,\"password\":", level_number);
    print_json_string(argv[4]);
    std::printf(",\"bestTimeTicks\":%d,\"source\":", best_time);
    print_solutioninfo_json(source);
    std::printf(",\"encoded\":{\"size\":%d,\"hex\":", save_series.games[0].solutionsize);
    print_json_string(hex_encode(save_series.games[0].solutiondata,
                                 static_cast<size_t>(save_series.games[0].solutionsize)).c_str());
    std::printf("},\"memoryRoundTrip\":");
    if (memory_roundtrip_ok)
        print_solutioninfo_json(memory_roundtrip);
    else
        std::printf("null");
    std::printf(",\"fileRoundTrip\":{\"bestTimeTicks\":%d,\"sgflags\":%d,"
                "\"solutionSize\":%d,\"hex\":",
                load_series.games[0].besttime,
                load_series.games[0].sgflags,
                load_series.games[0].solutionsize);
    if (load_series.games[0].solutiondata)
        print_json_string(hex_encode(load_series.games[0].solutiondata,
                                     static_cast<size_t>(load_series.games[0].solutionsize)).c_str());
    else
        print_json_string("");
    std::printf(",\"expanded\":");
    if (file_roundtrip_ok)
        print_solutioninfo_json(file_roundtrip);
    else
        std::printf("null");
    std::printf("}}\n");

    if (file_roundtrip_ok)
        destroymovelist(&file_roundtrip.moves);
    clear_roundtrip_series(&load_series);
    clear_roundtrip_series(&save_series);
    if (memory_roundtrip_ok)
        destroymovelist(&memory_roundtrip.moves);
    destroymovelist(&source.moves);
    std::remove(save_filename.c_str());
    return 0;
}

int command_input_trace_with_options(int argc, char** argv, TraceOptions const& trace_options,
                                     char const* command_name_text)
{
    gameseries series;
    std::vector<ScheduledInput> inputs;
    char* tail = NULL;
    int level_number;
    int level_index = -1;
    int max_ticks;
    int has_random_seed = FALSE;
    unsigned long random_seed = 0;
    gamesetup* game;

    if (argc < 4) {
        print_usage();
        return 2;
    }

    level_number = static_cast<int>(std::strtol(argv[3], &tail, 10));
    if (!tail || *tail != '\0') {
        std::fprintf(stderr, "invalid level number: %s\n", argv[3]);
        return 2;
    }
    if (!parse_input_spec(argc >= 5 ? argv[4] : "-", &inputs)) {
        std::fprintf(stderr, "invalid input trace specification: %s\n",
                     argc >= 5 ? argv[4] : "");
        return 2;
    }

    if (!load_single_series(argv[2], &series))
        return 1;
    game = find_game_by_number(&series, level_number, &level_index);
    if (!game) {
        std::fprintf(stderr, "unknown level number %d in %s\n", level_number, series.name);
        freeseriesdata(&series);
        return 1;
    }

    max_ticks = argc >= 6 ? static_cast<int>(std::strtol(argv[5], NULL, 10))
                          : default_input_trace_ticks(inputs);
    if (max_ticks < 0) {
        std::fprintf(stderr, "max-ticks must be non-negative\n");
        freeseriesdata(&series);
        return 2;
    }

    if (argc >= 7) {
        random_seed = std::strtoul(argv[6], &tail, 10);
        if (!tail || *tail != '\0') {
            std::fprintf(stderr, "invalid random seed: %s\n", argv[6]);
            freeseriesdata(&series);
            return 2;
        }
        has_random_seed = TRUE;
    }

    int rc = run_trace(command_name_text, &series, game, level_index, &inputs, max_ticks, FALSE,
                       has_random_seed, random_seed, trace_options);
    freeseriesdata(&series);
    return rc;
}

int command_input_trace(int argc, char** argv)
{
    return command_input_trace_with_options(argc, argv, canonical_trace_options(), "input-trace");
}

int command_input_trace_debug(int argc, char** argv)
{
    return command_input_trace_with_options(argc, argv, debug_trace_options(), "input-trace-debug");
}

int command_replay_trace_with_options(int argc, char** argv, TraceOptions const& trace_options,
                                      char const* command_name_text)
{
    gameseries series;
    char* tail = NULL;
    int level_number;
    int level_index = -1;
    int max_ticks;
    gamesetup* game;
    std::vector<ScheduledInput> no_inputs;

    if (argc < 4) {
        print_usage();
        return 2;
    }

    level_number = static_cast<int>(std::strtol(argv[3], &tail, 10));
    if (!tail || *tail != '\0') {
        std::fprintf(stderr, "invalid level number: %s\n", argv[3]);
        return 2;
    }

    if (!load_single_series(argv[2], &series))
        return 1;
    game = find_game_by_number(&series, level_number, &level_index);
    if (!game) {
        std::fprintf(stderr, "unknown level number %d in %s\n", level_number, series.name);
        freeseriesdata(&series);
        return 1;
    }

    max_ticks = argc >= 5 ? static_cast<int>(std::strtol(argv[4], NULL, 10))
                          : default_replay_trace_ticks(game);
    if (max_ticks <= 0) {
        std::fprintf(stderr, "max-ticks must be positive\n");
        freeseriesdata(&series);
        return 2;
    }

    int rc = run_trace(command_name_text, &series, game, level_index, &no_inputs, max_ticks, TRUE,
                       FALSE, 0, trace_options);
    freeseriesdata(&series);
    return rc;
}

int command_replay_trace(int argc, char** argv)
{
    return command_replay_trace_with_options(argc, argv, canonical_trace_options(), "replay-trace");
}

int command_replay_trace_debug(int argc, char** argv)
{
    return command_replay_trace_with_options(argc, argv, debug_trace_options(), "replay-trace-debug");
}

int command_replay_trace_solution_with_options(int argc, char** argv,
                                               TraceOptions const& trace_options,
                                               char const* command_name_text,
                                               int parse_step_window)
{
    gameseries series;
    std::vector<action> moves;
    std::vector<ScheduledInput> no_inputs;
    char* tail = NULL;
    int level_number;
    int level_index = -1;
    int max_ticks;
    int best_time;
    unsigned long flags;
    unsigned long random_slide_dir;
    int stepping;
    unsigned long random_seed;
    int window_start = 0;
    int window_end_exclusive = 0;
    int moves_arg_index = 10;
    gamesetup* game;

    if (argc < (parse_step_window ? 12 : 10)) {
        print_usage();
        return 2;
    }

    level_number = static_cast<int>(std::strtol(argv[3], &tail, 10));
    if (!tail || *tail != '\0') {
        std::fprintf(stderr, "invalid level number: %s\n", argv[3]);
        return 2;
    }

    max_ticks = static_cast<int>(std::strtol(argv[4], &tail, 10));
    if (!tail || *tail != '\0' || max_ticks <= 0) {
        std::fprintf(stderr, "invalid max ticks: %s\n", argv[4]);
        return 2;
    }

    best_time = static_cast<int>(std::strtol(argv[5], &tail, 10));
    if (!tail || *tail != '\0' || best_time < 0) {
        std::fprintf(stderr, "invalid best time: %s\n", argv[5]);
        return 2;
    }

    flags = std::strtoul(argv[6], &tail, 10);
    if (!tail || *tail != '\0') {
        std::fprintf(stderr, "invalid flags: %s\n", argv[6]);
        return 2;
    }

    random_slide_dir = std::strtoul(argv[7], &tail, 10);
    if (!tail || *tail != '\0' || random_slide_dir > 255) {
        std::fprintf(stderr, "invalid random slide direction: %s\n", argv[7]);
        return 2;
    }

    stepping = static_cast<int>(std::strtol(argv[8], &tail, 10));
    if (!tail || *tail != '\0' || stepping < 0 || stepping > 7) {
        std::fprintf(stderr, "invalid stepping: %s\n", argv[8]);
        return 2;
    }

    random_seed = std::strtoul(argv[9], &tail, 10);
    if (!tail || *tail != '\0') {
        std::fprintf(stderr, "invalid random seed: %s\n", argv[9]);
        return 2;
    }

    if (parse_step_window) {
        window_start = static_cast<int>(std::strtol(argv[10], &tail, 10));
        if (!tail || *tail != '\0' || window_start < 0) {
            std::fprintf(stderr, "invalid window start: %s\n", argv[10]);
            return 2;
        }

        window_end_exclusive = static_cast<int>(std::strtol(argv[11], &tail, 10));
        if (!tail || *tail != '\0' || window_end_exclusive < window_start) {
            std::fprintf(stderr, "invalid window end: %s\n", argv[11]);
            return 2;
        }
        moves_arg_index = 12;
    }

    if (!parse_solution_moves(argc > moves_arg_index ? argv[moves_arg_index] : "-", &moves)) {
        std::fprintf(stderr, "invalid move specification: %s\n", argc > moves_arg_index ? argv[moves_arg_index] : "");
        return 2;
    }

    if (!load_single_series(argv[2], &series))
        return 1;
    game = find_game_by_number(&series, level_number, &level_index);
    if (!game) {
        std::fprintf(stderr, "unknown level number %d in %s\n", level_number, series.name);
        freeseriesdata(&series);
        return 1;
    }

    if (!assign_solution_data(game, best_time, flags, random_slide_dir, stepping, random_seed, moves)) {
        freeseriesdata(&series);
        return 1;
    }

    TraceOptions command_trace_options = trace_options;
    if (parse_step_window) {
        command_trace_options.has_step_window = true;
        command_trace_options.step_window_start = window_start;
        command_trace_options.step_window_end_exclusive = window_end_exclusive;
    }

    int rc = run_trace(command_name_text, &series, game, level_index, &no_inputs, max_ticks, TRUE,
                       FALSE, 0, command_trace_options);
    freeseriesdata(&series);
    return rc;
}

int command_replay_trace_solution(int argc, char** argv)
{
    return command_replay_trace_solution_with_options(
        argc, argv, canonical_trace_options(), "replay-trace", FALSE);
}

int command_replay_trace_solution_debug(int argc, char** argv)
{
    return command_replay_trace_solution_with_options(
        argc, argv, debug_trace_options(), "replay-trace-debug", FALSE);
}

int command_replay_trace_solution_debug_window(int argc, char** argv)
{
    return command_replay_trace_solution_with_options(
        argc, argv, debug_trace_options(), "replay-trace-debug", TRUE);
}

} // namespace

int main(int argc, char** argv)
{
    OracleOptions options;
    int command_index = parse_global_options(argc, argv, &options);

    if (command_index == -1) {
        print_usage();
        return 0;
    }
    if (command_index < 0)
        return 2;

    ScopedDirs dirs(options);

    if (command_index >= argc) {
        print_usage();
        return 2;
    }

    argc -= command_index - 1;
    argv += command_index - 1;

    if (!std::strcmp(argv[1], "series-list"))
        return command_series_list(argc, argv);
    if (!std::strcmp(argv[1], "level-info"))
        return command_level_info(argc, argv);
    if (!std::strcmp(argv[1], "score-table"))
        return command_score_table(argc, argv);
    if (!std::strcmp(argv[1], "times-table"))
        return command_times_table(argc, argv);
    if (!std::strcmp(argv[1], "solution-list"))
        return command_solution_list(argc, argv);
    if (!std::strcmp(argv[1], "solution-roundtrip"))
        return command_solution_roundtrip(argc, argv);
    if (!std::strcmp(argv[1], "input-trace"))
        return command_input_trace(argc, argv);
    if (!std::strcmp(argv[1], "input-trace-debug"))
        return command_input_trace_debug(argc, argv);
    if (!std::strcmp(argv[1], "replay-trace"))
        return command_replay_trace(argc, argv);
    if (!std::strcmp(argv[1], "replay-trace-debug"))
        return command_replay_trace_debug(argc, argv);
    if (!std::strcmp(argv[1], "replay-trace-solution"))
        return command_replay_trace_solution(argc, argv);
    if (!std::strcmp(argv[1], "replay-trace-solution-debug"))
        return command_replay_trace_solution_debug(argc, argv);
    if (!std::strcmp(argv[1], "replay-trace-solution-debug-window"))
        return command_replay_trace_solution_debug_window(argc, argv);

    print_usage();
    return 2;
}
