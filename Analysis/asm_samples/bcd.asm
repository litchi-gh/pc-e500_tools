; 内部 RAM $20-$2F を退避し、DADL で 4 バイト BCD 加算を行う
        ORG  $BEC00
WORK    EQU  $20               ; 内部 RAM $20-$2F を作業に使う
SAVE    EQU  $BEF00            ; 退避先（機械語エリア内）
RESULT  EQU  $BED00            ; 結果の書出し先
start:  PUSHU X
        PUSHU I
        MV   I,16
        MVL  [SAVE],(WORK)     ; 内部 RAM $20-$2F を退避
        MV   X,operands
        MV   I,8
        MVL  (WORK),[X]        ; 被加数 4 バイト + 加数 4 バイト
        MV   I,4
        DADL (WORK+3),(WORK+7) ; 10 進加算。最下位バイトを指定し、下位番地へ進む
        MV   I,4
        MVL  [RESULT],(WORK)   ; 結果 ($20-$23) を外部メモリへ
        MV   I,16
        MVL  (WORK),[SAVE]     ; 内部 RAM を復帰
        POPU I
        POPU X
        RC
        RETF
operands:
        DB   $00,$12,$34,$56   ; 00123456（上位桁が先頭）
        DB   $00,$00,$99,$99   ; 00009999
        END
