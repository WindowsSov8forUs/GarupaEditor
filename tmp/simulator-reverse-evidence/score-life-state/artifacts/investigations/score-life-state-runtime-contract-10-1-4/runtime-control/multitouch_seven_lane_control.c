#include <errno.h>
#include <fcntl.h>
#include <linux/input.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/time.h>
#include <time.h>
#include <unistd.h>

static const char *const kEventDevice = "/dev/input/event2";
static const int32_t kRawX = 70;
static const int32_t kRawY[7] = {380, 520, 660, 800, 940, 1080, 1220};
static const int kRepeat = 250;
static const long kTouchNanoseconds = 20000000L;
static const long kReleaseNanoseconds = 60000000L;

static int emit_event(int fd, uint16_t type, uint16_t code, int32_t value) {
    struct input_event event;
    memset(&event, 0, sizeof(event));
    if (gettimeofday(&event.time, NULL) != 0) {
        return -1;
    }
    event.type = type;
    event.code = code;
    event.value = value;
    const unsigned char *cursor = (const unsigned char *)&event;
    size_t remaining = sizeof(event);
    while (remaining > 0) {
        ssize_t written = write(fd, cursor, remaining);
        if (written < 0) {
            if (errno == EINTR) {
                continue;
            }
            return -1;
        }
        cursor += (size_t)written;
        remaining -= (size_t)written;
    }
    return 0;
}

static int sleep_nanoseconds(long nanoseconds) {
    struct timespec request = {.tv_sec = 0, .tv_nsec = nanoseconds};
    while (nanosleep(&request, &request) != 0) {
        if (errno != EINTR) {
            return -1;
        }
    }
    return 0;
}

static int press_all(int fd) {
    for (int slot = 0; slot < 7; ++slot) {
        if (emit_event(fd, EV_ABS, ABS_MT_SLOT, slot) != 0 ||
            emit_event(fd, EV_ABS, ABS_MT_TRACKING_ID, 100 + slot) != 0 ||
            emit_event(fd, EV_ABS, ABS_MT_POSITION_X, kRawX) != 0 ||
            emit_event(fd, EV_ABS, ABS_MT_POSITION_Y, kRawY[slot]) != 0) {
            return -1;
        }
    }
    return emit_event(fd, EV_KEY, BTN_TOUCH, 1) == 0 &&
                   emit_event(fd, EV_SYN, SYN_REPORT, 0) == 0
               ? 0
               : -1;
}

static int release_all(int fd) {
    for (int slot = 0; slot < 7; ++slot) {
        if (emit_event(fd, EV_ABS, ABS_MT_SLOT, slot) != 0 ||
            emit_event(fd, EV_ABS, ABS_MT_TRACKING_ID, -1) != 0) {
            return -1;
        }
    }
    return emit_event(fd, EV_KEY, BTN_TOUCH, 0) == 0 &&
                   emit_event(fd, EV_SYN, SYN_REPORT, 0) == 0
               ? 0
               : -1;
}

int main(int argc, char **argv) {
    if (argc != 1 || argv == NULL) {
        return 64;
    }
    int fd = open(kEventDevice, O_WRONLY | O_CLOEXEC);
    if (fd < 0) {
        return 65;
    }
    for (int cycle = 0; cycle < kRepeat; ++cycle) {
        if (press_all(fd) != 0 || sleep_nanoseconds(kTouchNanoseconds) != 0 ||
            release_all(fd) != 0 || sleep_nanoseconds(kReleaseNanoseconds) != 0) {
            close(fd);
            return 66;
        }
    }
    if (close(fd) != 0) {
        return 67;
    }
    return 0;
}
