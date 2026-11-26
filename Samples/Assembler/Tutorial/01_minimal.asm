; 01: BASIC へ戻るだけのプログラム
        ORG   $BEC00            ; 置くアドレス
start:  RC                      ; C = 0（エラーなし）
        RETF                    ; BASIC へ戻る
        END
