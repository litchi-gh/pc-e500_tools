; Addressing / encoding demonstration (not a standalone runnable program).
        ORG &B9000
        MV A,(&20)            ; absolute internal RAM, PRE 30h
        MV A,(BP+&20)         ; BP relative, no PRE
        MV (PX+2),(PY+3)      ; PRE 37h
        MV (BP+PX),(BP+PY)    ; PRE 25h
        MV X,&B8000
        MV A,[X++]
        MV [--Y],BA
        MVW (&20),[X+5]
        MVP [(&40)+2],(&30)
        MVL (&20),[X]         ; encoded as [X+0]
        CALLF &FFFE8
data:   DB "PC-E500",13,10,0
        DW &1234
        DP &B8000
