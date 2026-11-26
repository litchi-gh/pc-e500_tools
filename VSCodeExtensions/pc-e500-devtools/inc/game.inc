; game.inc: ゲームの始まりと終わり、時間待ち、音（hardware.inc が要る）
;
;   start:  CALL  game_start        ; 最初に 1 回
;           ...
;           CALL  game_end          ; BASIC に戻る前に 1 回
;           RC
;           RETF
;
; game_start から game_end までは割り込みが止まり、内部 RAM の 00h〜BFh を自由に使える
; （元の内容は game_end で戻る）。20h〜5Fh は下の INCLUDE が、60h〜BFh は screen.inc と
; text.inc が使うので、自分の変数は 00h〜1Fh に置く。

game_ticks      EQU $3F         ; 作業用

; 始める: 内部 RAM を退避し、割り込みを止め、LCD の表示開始ラインを 0 にする。
game_start:
        PUSHU IMR               ; U スタックに積んだまま戻る（game_end で取り出す）
        MV    I,$C0
        MVL   [game_saved],($00)
        MV    A,(SCR)
        MV    [game_scr],A
        AND   (SCR),BZ_OFF      ; キークリックの音が鳴ったままにならないように
game_lcd1:
        MV    A,[LCD_A_STATUS]
        TEST  A,LCD_BUSY
        JRNZ  game_lcd1
        MV    A,LCD_START
        MV    [LCD_A],A
game_lcd2:
        MV    A,[LCD_B_STATUS]
        TEST  A,LCD_BUSY
        JRNZ  game_lcd2
        MV    A,LCD_START
        MV    [LCD_B],A
        MV    ($20),$FF         ; pad_read: 始まる前から押されているキーは「いま押された」にしない
        AND   (ISR),$FF-MTI
        RET

; 終わる: 音を止め、ON/BRK が離されるのを待ち、画面を消し、すべて元に戻す。
game_end:
        AND   (SCR),BZ_OFF
game_end1:
        MV    (KOL),0
        AND   (KOH),$F0         ; KOH の上位 4 ビットは別の信号なので残す
        OR    (KOH),$08         ; KO11: ON/BRK は KI1
        NOP
        TEST  (KI),$02
        JRNZ  game_end1
        AND   (KOH),$F0
        MV    I,$C0
        MVL   ($00),[game_saved]
        MV    A,[game_scr]
        AND   A,BZ_OFF
        MV    (SCR),A
        MV    ($D6),0           ; 画面
        MV    ($D7),0
        MV    IL,$51            ; 画面を消す
        CALLF $FFFE8
        AND   (ISR),$F2         ; たまったキーと BRK の要求を消す
        POPU  IMR
        RET

; A × 約 16 ミリ秒待つ。前に呼んでからの時間も数えるが、数えるのは 1 回分まで
; （それより重い処理は、そのぶん 1 ターンが長くなる）。
game_wait:
        MV    (game_ticks),A
game_wait1:
        TEST  (ISR),MTI
        JRZ   game_wait1
        AND   (ISR),$FF-MTI
        DEC   (game_ticks)
        JRNZ  game_wait1
        RET

; ブザーを鳴らす（A = BZ_2K か BZ_4K）。sound_off まで鳴り続ける。
sound_on:
        AND   (SCR),BZ_OFF
        OR    (SCR),A
        RET
sound_off:
        AND   (SCR),BZ_OFF
        RET

game_scr:   DB 0
game_saved: DS $C0
