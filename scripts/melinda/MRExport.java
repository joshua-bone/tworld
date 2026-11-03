import java.io.PrintStream;
import java.util.ArrayList;

/** Use MR's own DAT reader and helper protocol without opening its GUI. */
public class MRExport {
    static class Capture extends HelperIO {
        Capture() { super(null); }
        public void send_to(String value) { System.out.println(value); }
        public void send_to_flush(String value) { System.out.println(value); }
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            throw new IllegalArgumentException("usage: MRExport PACK.dat LEVEL");
        }
        MelindaRouterMS mr = new MelindaRouterMS();
        mr.HELPER = new Capture();
        ArrayList<Level> levels = new ArrayList<>();
        PrintStream output = System.out;
        try {
            // Upstream reader diagnostics must not enter the helper protocol.
            System.setOut(System.err);
            new ReaderDAT(mr, new TileInfo().TR, true).read_DAT_file(args[0], levels);
        } finally {
            System.setOut(output);
        }
        int number = Integer.parseInt(args[1]);
        ArrayList<Level> matches = new ArrayList<>();
        for (Level level : levels) {
            if (level.num == number) matches.add(level);
        }
        if (matches.size() != 1) {
            throw new IllegalArgumentException("expected exactly one matching level");
        }
        matches.get(0).output_level_data(new Capture());
    }
}
