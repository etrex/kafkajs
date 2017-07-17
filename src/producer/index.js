const Cluster = require('../cluster')
const createDefaultPartitioner = require('./partitioners/default')
const groupMessagesPerPartition = require('./groupMessagesPerPartition')

const createTopicData = ({ topic, partitions, messagesPerPartition }) => [
  {
    topic,
    partitions: partitions.map(partition => ({
      partition,
      messages: messagesPerPartition[partition],
    })),
  },
]

module.exports = ({ host, port, logger, createPartitioner = createDefaultPartitioner }) => {
  const cluster = new Cluster({ host, port, logger })
  const partitioner = createPartitioner()

  return {
    connect: async () => await cluster.connect(),
    disconnect: async () => await cluster.disconnect(),
    send: async ({ topic, messages }) => {
      await cluster.addTargetTopic(topic)
      const partitionMetadata = cluster.findTopicPartitionMetadata(topic)
      const messagesPerPartition = groupMessagesPerPartition({
        topic,
        partitionMetadata,
        messages,
        partitioner,
      })

      const partitionsPerLeader = cluster.findLeaderForPartitions(
        topic,
        Object.keys(messagesPerPartition)
      )

      const requests = Object.keys(partitionsPerLeader).map(async nodeId => {
        const partitions = partitionsPerLeader[nodeId]
        const topicData = createTopicData({ topic, partitions, messagesPerPartition })
        const broker = await cluster.findBroker({ nodeId })
        return await broker.produce({ topicData })
      })

      return await Promise.all(requests)
    },
  }
}
