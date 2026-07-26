; Curated ARM64 evidence from the locked libil2cpp.so.

; NoteManager.isBpmChangeNote
037757c8  cmp  w1, #3
037757cc  cset w8, eq
037757d0  cmp  w1, #8
037757d4  cset w9, eq
037757d8  orr  w0, w8, w9

; NoteManager.activateNotesJustNow calls the process once for launchNoteList.
037784ec  mov  x0, x19
037784f0  mov  x1, x20
037784f4  bl   0x377b650

; activateBPMChangeNoteProcess scans source order and tail-calls setup for the
; first ccNum 3 or 8.
0377b6b0  ldr  x2, [x23]
0377b6bc  bl   0x5768734
0377b6c4  ldr  w8, [x0, #0x48]
0377b6c8  cmp  w8, #8
0377b6cc  b.eq 0x377b6fc
0377b6d0  cmp  w8, #3
0377b6d4  b.eq 0x377b6fc
0377b734  str  s8, [x8, #0x38]       ; musicScore.nextBPM
0377b768  b    0x3776a54             ; setupBpmChangeNote

; NoteBpmChange.Setup fields.
030e9be8  str  x1, [x0, #0x18]       ; noteInfo
030e9c00  str  s8, [x21, #0x20]      ; bpm
030e9c04  str  x20, [x0, #0x28]      ; bpmString
030e9c10  str  x19, [x21, #0x30]     ; noteManager
030e9c24  sturb w8, [x21, #-0x20]    ; isActive = true

; ExecUpdate: compare command bar with current music bar.
030e9cb0  ldr  s0, [x8, #0x4c]       ; noteInfo.barIndex
030e9cb4  ldr  s1, [x9, #0x44]       ; musicBarProgress
030e9cc0  fcmp s0, s1
030e9cfc  b.pl 0x30e9cf0             ; command bar is still ahead

; Same bar: integer threshold = 192 * numerator / denominator.
030e9cc8  ldr  x10, [x21]
030e9ccc  ldr  w8, [x8, #0x54]       ; denominator
030e9cd0  ldr  s0, [x9, #0x48]       ; musicBeatProgress
030e9cd4  ldr  x10, [x10, #0xb8]     ; static 192
030e9cd8  ldr  w10, [x10]
030e9cdc  mul  w9, w10, w20          ; numerator
030e9ce0  sdiv w8, w9, w8
030e9ce8  fcmp s0, s1
030e9cec  b.ge 0x30e9d00
030e9d0c  b    0x30e9d14

; updateBpm writes both values, clears active, then invokes callback.
030e9d2c  ldr  x1, [x19, #0x28]
030e9d30  ldr  s0, [x19, #0x20]
030e9d38  bl   0x330491c             ; UpdateBPM
030e9d40  strb wzr, [x19, #0x10]
030e9d5c  br   x3                    ; onBpmChanged callback

; InGameMusicScoreController.UpdateBPM.
0330491c  str  x1, [x0, #0x20]!
03304920  stur s0, [x0, #-4]
03304924  b    0x2e101bc

; NoteManager.onBpmChanged removes the object from activeNoteBpmChangeList.
0377b938  ldr  x0, [x20, #0x48]
0377b948  mov  x1, x19
0377b958  b    0x5769fcc

; parseHeaderData decompile confirms plain #BPM stores both forms:
; builder +0x38 = parsed float startBpm
; builder +0x40 = original StartBpmString

; createBpmChangeList decompile confirms:
; CC03 -> parse the two-character cell with radix 16
; CC08 -> resolve the cell through specificBpmDictionary
