; SC62015: calculate 10 + 9 + ... + 1, leave 55 in A.
; Example origin only: reserve the load area before running on a PC-E500.
        ORG &B8000
COUNT   EQU 10
start:
        MV A,0
        MV IL,COUNT
loop:
        ADD A,IL
        DEC IL
        JRNZ loop
        RET
        END
