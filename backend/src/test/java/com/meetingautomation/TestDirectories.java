package com.meetingautomation;

import java.io.IOException;
import java.nio.file.*;
import java.util.Comparator;
import java.util.stream.Stream;

/**
 * 테스트용 임시 디렉터리. 설정 저장소는 git 저장소 안의 경로를 거부하므로 저장소 밖인
 * 시스템 임시 디렉터리(java.io.tmpdir)에 만들고, JVM 종료 시 내용까지 삭제한다.
 */
public final class TestDirectories {
    private TestDirectories() { }

    public static Path create(String prefix) {
        try {
            Path directory = Files.createTempDirectory(prefix);
            Runtime.getRuntime().addShutdownHook(new Thread(() -> deleteRecursively(directory)));
            return directory;
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    static void deleteRecursively(Path directory) {
        if (!Files.exists(directory, LinkOption.NOFOLLOW_LINKS)) return;
        try (Stream<Path> paths = Files.walk(directory)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try { Files.deleteIfExists(path); } catch (IOException ignored) { }
            });
        } catch (IOException ignored) { }
    }
}
