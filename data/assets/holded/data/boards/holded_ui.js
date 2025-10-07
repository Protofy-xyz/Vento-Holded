//@card/react
//board is the board object
//state is the state of the board

function Widget({board, state}) {
    const cards = board.cards.reduce((total, card) => {
        return {
            ...total,
            [card.name]: card
        }
    }, {})


    return <XStack gap="$5" width="100%" f={1}>
        <YStack>
            {
                Object.keys(cards).map(card => {
                    return <YStack height="60px" jc="center" gap={"$4"}>
                        <div>{card}</div>
                    </YStack>
                })
            }
        </YStack>
        <YStack>
            {
                Object.keys(cards).map(card => {
                    return <XStack ai="center" height="60px" gap={"$4"}>
                        <div>{JSON.stringify(state?.[card])}</div>
                    </XStack>
                })
            }
        </YStack>
        <YStack>
            {
                Object.keys(cards).map(card => {
                    return <XStack ai="center" height="60px" gap={"$4"}>
                        {cards[card] && cards[card].type == 'action' ? <Button onPress={() => {
                            execute_action(card, {})
                        }}>Run</Button> : ''}
                    </XStack>
                })
            }
        </YStack>
    </XStack>
}
                