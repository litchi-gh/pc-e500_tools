; [$BED00] + [$BED01] → [$BED02]
        ORG  $BEC00
        MV   A,[$BED00]
        MV   IL,[$BED01]     ; IH は 0 になる
        ADD  A,IL
        MV   [$BED02],A
        RETF                  ; C は ADD の結果のまま返る
        END
