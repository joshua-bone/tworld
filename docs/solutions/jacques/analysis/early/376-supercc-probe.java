import emulator.*;
import game.*;
import java.io.File;

/** Observation-only subclass; the optional control changes one supplied click. */
public class JacquesSuperCCProbe extends SuperCC {
    public JacquesSuperCCProbe() { super(false); }

    private static int goal(Level level) {
        try {
            var field = level.getClass().getSuperclass().getDeclaredField("mouseGoal");
            field.setAccessible(true);
            return field.getInt(level);
        } catch (ReflectiveOperationException error) {
            throw new RuntimeException(error);
        }
    }

    @Override
    public boolean tick(char input, Direction[] directions, TickFlags flags) {
        var level = getLevel();
        int before = level.getTickNumber();
        if (Boolean.getBoolean("absoluteClick") && before == 371 && SuperCC.isClick(input)) {
            // Control: supply the intended absolute target, bypassing relative import.
            level.setClick(320);
            input = new Position(320).clickChar(level.getChip().getPosition());
        }
        if (before >= 365 && before <= 380) {
            System.out.println("BEFORE half=" + before + " c=" + (int) input
                + " pos=" + level.getChip().getPosition() + " dir=" + level.getChip().getDirection()
                + " slide=" + level.getChip().isSliding() + " goal=" + goal(level));
        }
        boolean multi = super.tick(input, directions, flags);
        if (before >= 365 && before <= 380) {
            System.out.println("AFTER half=" + level.getTickNumber()
                + " pos=" + level.getChip().getPosition() + " dir=" + level.getChip().getDirection()
                + " slide=" + level.getChip().isSliding() + " goal=" + goal(level)
                + " dead=" + level.getChip().isDead());
        }
        return multi;
    }

    public static void main(String[] args) {
        try {
            var emulator = new JacquesSuperCCProbe();
            emulator.openLevelset(new File(args[0]));
            emulator.loadLevel(376);
            var reader = new io.TWSReader(new File(args[1]));
            var solution = reader.readSolution(emulator.getLevel());
            solution.load(emulator, TickFlags.LIGHT);
            var level = emulator.getLevel();
            System.out.println("FINAL half=" + level.getTickNumber()
                + " pos=" + level.getChip().getPosition() + " won=" + level.isCompleted()
                + " dead=" + level.getChip().isDead());
        } catch (Exception error) {
            throw new RuntimeException(error);
        }
    }
}
